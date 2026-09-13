import { useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";

export interface StudyCard {
  id: string;
  front: string;
  back: string;
}

interface StudySessionProps {
  cards: StudyCard[];
}

type Rating = "remembered" | "forgot";

interface ErrorResponse {
  error?: string;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorResponse | null;
  return body?.error ?? fallback;
}

export default function StudySession({ cards: initialCards }: StudySessionProps) {
  const [queue, setQueue] = useState<StudyCard[]>(initialCards);
  const [revealed, setRevealed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ternary (not plain indexing) so TS types `current` as possibly
  // `undefined` — a bare `queue[0]` types as always-present since arrays
  // aren't index-checked, which would make the empty-queue guards below
  // look tautological to the linter.
  const current = queue.length > 0 ? queue[0] : undefined;

  function handleReveal() {
    setRevealed(true);
  }

  async function handleRate(rating: Rating) {
    if (!current) return;

    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/study/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Rating failed. Please try again.");
        setError(message);
        return;
      }

      // A "forgot" card requeues to the end of the local session queue
      // (server already reset its due_at to now — see plan's Critical
      // Implementation Details); "remembered" simply drops it.
      setQueue((prev) => {
        const [, ...rest] = prev;
        return rating === "forgot" ? [...rest, current] : rest;
      });
      setRevealed(false);
    } catch {
      setError("Rating failed. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  if (!current) {
    return (
      <div className="text-center">
        <p className="text-blue-100/80">All done — nothing left to study.</p>
        <a href="/dashboard" className="mt-4 inline-block text-sm text-purple-300 hover:underline">
          &larr; Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-right text-xs text-blue-100/50">{queue.length} remaining</p>

      <div className="rounded-xl border border-white/15 bg-white/10 p-6 text-center">
        <p className="text-lg text-white">{current.front}</p>
        {revealed && <p className="mt-4 border-t border-white/10 pt-4 text-lg text-blue-100/90">{current.back}</p>}
      </div>

      <div className="mt-4 flex justify-center gap-3">
        {revealed ? (
          <>
            <button
              type="button"
              onClick={() => {
                void handleRate("forgot");
              }}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-60"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Forgot
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRate("remembered");
              }}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-emerald-400/40 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Remembered
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleReveal}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
          >
            Show answer
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 flex items-center justify-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}
