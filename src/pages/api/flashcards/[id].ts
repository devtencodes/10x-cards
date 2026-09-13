import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const MIN_FIELD_LENGTH = 1;
const MAX_FIELD_LENGTH = 2000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidField(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= MIN_FIELD_LENGTH && value.length <= MAX_FIELD_LENGTH;
}

export const PATCH: APIRoute = async (context) => {
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
  const front = record.front;
  const back = record.back;

  if (!isValidField(front) || !isValidField(back)) {
    return Response.json(
      { error: `front/back must be ${String(MIN_FIELD_LENGTH)}-${String(MAX_FIELD_LENGTH)} characters` },
      { status: 400 },
    );
  }

  // .select() after .update() returns the affected rows. Under RLS, a
  // nonexistent id or one this user doesn't own silently returns an empty
  // array — no error — so that's how "not found" must be detected here.
  const { data, error } = await supabase
    .from("flashcards")
    .update({ front, back })
    .eq("id", id)
    .select("front, back, updated_at");

  if (error) {
    console.error("Flashcard update failed:", error);
    return Response.json({ error: "Update failed. Please try again." }, { status: 500 });
  }

  if (data.length === 0) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  return Response.json(data[0], { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
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

  // Same RLS-empty-array reasoning as PATCH above — no explicit user_id
  // filter needed; RLS scopes it, and .select() lets us tell "deleted" from
  // "nothing matched" without a separate existence check.
  const { data, error } = await supabase.from("flashcards").delete().eq("id", id).select("id");

  if (error) {
    console.error("Flashcard delete failed:", error);
    return Response.json({ error: "Delete failed. Please try again." }, { status: 500 });
  }

  if (data.length === 0) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  return Response.json({ deleted: true }, { status: 200 });
};
