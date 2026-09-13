import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const GROWTH_FACTOR = 2.5;

type ScheduleState = "new" | "learning" | "review";
type Rating = "remembered" | "forgot";

function isRating(value: unknown): value is Rating {
  return value === "remembered" || value === "forgot";
}

// Full 6-row state-transition table (see plan.md Phase 1). `state` is read
// back from the DB as a plain string, but only ever takes these three values.
function computeNextSchedule(
  state: string,
  rating: Rating,
  intervalDays: number,
): { state: ScheduleState; interval_days: number; due_at: string } {
  if (state === "review" && rating === "remembered") {
    // Math.round rounds half away from zero for positive inputs, matching
    // the plan's rounding rule; max(1, ...) floors any smaller edge case.
    const nextInterval = Math.max(1, Math.round(intervalDays * GROWTH_FACTOR));
    return {
      state: "review",
      interval_days: nextInterval,
      due_at: new Date(Date.now() + nextInterval * DAY_MS).toISOString(),
    };
  }

  if (rating === "remembered") {
    // "new" -> "learning", "learning" -> "review" (one graduation step each).
    const nextState: ScheduleState = state === "new" ? "learning" : "review";
    return { state: nextState, interval_days: 1, due_at: new Date(Date.now() + DAY_MS).toISOString() };
  }

  // rating === "forgot": "new" stays "new"; "learning"/"review" both lapse
  // fully to "learning".
  const nextState: ScheduleState = state === "new" ? "new" : "learning";
  return { state: nextState, interval_days: 0, due_at: new Date().toISOString() };
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = context.params;
  if (!id) {
    return Response.json({ error: "Flashcard id is required" }, { status: 400 });
  }
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid flashcard id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const rating = record.rating;
  if (!isRating(rating)) {
    return Response.json({ error: 'rating must be "remembered" or "forgot"' }, { status: 400 });
  }

  // RLS scopes ownership — no explicit user_id filter needed, same
  // reasoning as src/pages/api/flashcards/[id].ts. An empty result means the
  // flashcard doesn't exist or isn't owned by this user.
  const { data: current, error: readError } = await supabase
    .from("review_schedules")
    .select("state, interval_days")
    .eq("flashcard_id", id);

  if (readError) {
    console.error("Study schedule lookup failed:", readError);
    return Response.json({ error: "Rating failed. Please try again." }, { status: 500 });
  }

  if (current.length === 0) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  const next = computeNextSchedule(current[0].state, rating, current[0].interval_days);

  const { data, error } = await supabase
    .from("review_schedules")
    .update({
      state: next.state,
      interval_days: next.interval_days,
      due_at: next.due_at,
      // Stamped unconditionally — a "forgot" rating is still a review
      // attempt, not just a successful recall.
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("flashcard_id", id)
    .select("state, interval_days, due_at, last_reviewed_at");

  if (error) {
    console.error("Study rating update failed:", error);
    return Response.json({ error: "Rating failed. Please try again." }, { status: 500 });
  }

  if (data.length === 0) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  return Response.json(data[0], { status: 200 });
};
