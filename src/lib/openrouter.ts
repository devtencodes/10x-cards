import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_CANDIDATES = 20;
const TIMEOUT_MS = 30_000;
/** Cap on how much raw model output (which echoes the user's source text) reaches logs on a parse failure. */
const LOG_PREVIEW_LENGTH = 500;

export interface FlashcardCandidate {
  front: string;
  back: string;
}

export class GenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerationError";
  }
}

function buildPrompt(text: string): string {
  return `You are an expert study-flashcard writer. Read the SOURCE TEXT below and extract the distinct facts or concepts in it.

For each fact or concept, write one flashcard as a question/answer pair: a concise question in "front" and its answer in "back".

Respond with ONLY a JSON array of objects, no prose before or after, in this exact shape:
[{"front": "...", "back": "..."}, ...]

Rules:
- Produce at most ${MAX_CANDIDATES} flashcards.
- Write both "front" and "back" in the same language as the SOURCE TEXT.
- Skip trivial, duplicate, or overly broad facts.

SOURCE TEXT:
"""
${text}
"""`;
}

/**
 * Scans for the first top-level JSON array in raw text and returns its exact
 * substring, ignoring anything before or after it (prose, code fences, or —
 * as observed from a compact free-tier model — the model restating its
 * answer more than once in the same response). Bracket depth is tracked
 * with awareness of quoted strings so `[`/`]` characters inside a card's
 * front/back text don't throw off the match.
 */
function extractFirstJsonArray(raw: string): string | null {
  const start = raw.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

function isCandidate(value: unknown): value is FlashcardCandidate {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.front === "string" &&
    record.front.trim().length > 0 &&
    typeof record.back === "string" &&
    record.back.trim().length > 0
  );
}

/**
 * Defensively parses the model's raw text output into a validated candidate array.
 * Malformed JSON is a failure (GenerationError); valid JSON with zero surviving
 * candidates after filtering is a successful empty result.
 */
function parseCandidates(raw: string): FlashcardCandidate[] {
  const arrayText = extractFirstJsonArray(raw);
  if (arrayText === null) {
    console.error("Raw model content had no JSON array:", JSON.stringify(raw.slice(0, LOG_PREVIEW_LENGTH)));
    throw new GenerationError("Model response contained no JSON array");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch (error) {
    console.error("Raw model content that failed to parse:", JSON.stringify(raw.slice(0, LOG_PREVIEW_LENGTH)));
    throw new GenerationError("Model response was not valid JSON", { cause: error });
  }

  if (!Array.isArray(parsed)) {
    throw new GenerationError("Model response was not a JSON array");
  }

  return parsed
    .filter(isCandidate)
    .map((candidate) => ({ front: candidate.front.trim(), back: candidate.back.trim() }))
    .slice(0, MAX_CANDIDATES);
}

function extractMessageContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const [first] = choices as unknown[];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null) return null;

  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" ? content : null;
}

/**
 * Calls OpenRouter to turn source text into candidate flashcards.
 *
 * No `response_format` is sent — OpenRouter fails the whole request when a
 * model/route doesn't support structured outputs, so the array shape is
 * prompt-instructed only and enforced by defensive parsing on the way back.
 */
export async function generateFlashcardCandidates(text: string): Promise<FlashcardCandidate[]> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: buildPrompt(text) }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new GenerationError("Failed to reach OpenRouter", { cause: error });
  }

  if (!response.ok) {
    throw new GenerationError(`OpenRouter returned ${String(response.status)}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new GenerationError("OpenRouter response was not valid JSON", { cause: error });
  }

  const content = extractMessageContent(payload);
  if (content === null) {
    throw new GenerationError("OpenRouter response had no message content");
  }

  return parseCandidates(content);
}
