import type { APIRoute } from "astro";
import { OPENROUTER_API_KEY } from "astro:env/server";
import { generateFlashcardCandidates, GenerationError } from "@/lib/openrouter";

const MIN_TEXT_LENGTH = 100;
const MAX_TEXT_LENGTH = 10_000;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!OPENROUTER_API_KEY) {
    return Response.json({ error: "AI generation is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const text = typeof body === "object" && body !== null ? (body as Record<string, unknown>).text : undefined;

  if (typeof text !== "string" || text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `text must be between ${String(MIN_TEXT_LENGTH)} and ${String(MAX_TEXT_LENGTH)} characters` },
      { status: 400 },
    );
  }

  try {
    const candidates = await generateFlashcardCandidates(text);
    return Response.json({ candidates }, { status: 200 });
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error("Flashcard generation failed:", error, error.cause ?? "");
      return Response.json({ error: "Generation failed. Please try again." }, { status: 502 });
    }
    throw error;
  }
};
