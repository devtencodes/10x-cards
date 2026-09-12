import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const MAX_CARDS = 20;
const MIN_FIELD_LENGTH = 1;
const MAX_FIELD_LENGTH = 2000;

const VALID_SOURCES = ["ai_generated", "ai_edited"] as const;
type CardSource = (typeof VALID_SOURCES)[number];

interface CardInput {
  front: string;
  back: string;
  source: CardSource;
}

function isValidField(value: unknown): value is string {
  // Reject whitespace-only content while still enforcing the DB's raw char_length cap.
  return typeof value === "string" && value.trim().length >= MIN_FIELD_LENGTH && value.length <= MAX_FIELD_LENGTH;
}

function isValidSource(value: unknown): value is CardSource {
  return typeof value === "string" && (VALID_SOURCES as readonly string[]).includes(value);
}

function isValidCard(value: unknown): value is CardInput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return isValidField(record.front) && isValidField(record.back) && isValidSource(record.source);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const cards = typeof body === "object" && body !== null ? (body as Record<string, unknown>).cards : undefined;

  if (!Array.isArray(cards) || cards.length === 0 || cards.length > MAX_CARDS || !cards.every(isValidCard)) {
    return Response.json(
      {
        error: `cards must be a non-empty array of up to ${String(MAX_CARDS)} entries, each with front/back (1-${String(MAX_FIELD_LENGTH)} chars) and a valid source`,
      },
      { status: 400 },
    );
  }

  // Single multi-row INSERT — atomic all-or-nothing, no partial saves on failure.
  const { error } = await supabase.from("flashcards").insert(
    cards.map((card) => ({
      front: card.front,
      back: card.back,
      source: card.source,
      user_id: user.id,
    })),
  );

  if (error) {
    console.error("Flashcard save failed:", error);
    return Response.json({ error: "Save failed. Please try again." }, { status: 500 });
  }

  return Response.json({ saved: cards.length }, { status: 201 });
};
