import { useState } from "react";
import { CheckCheck, CircleAlert, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { CandidateCard, type Candidate } from "@/components/flashcards/CandidateCard";
import { cn } from "@/lib/utils";

const MIN_TEXT_LENGTH = 100;
const MAX_TEXT_LENGTH = 10_000;

type GenerateStatus = "idle" | "generating" | "error";

interface GenerateResponse {
  candidates: { front: string; back: string }[];
}

function lengthError(length: number): string | null {
  if (length === 0) return null;
  if (length < MIN_TEXT_LENGTH) {
    return `Add at least ${String(MIN_TEXT_LENGTH - length)} more character${MIN_TEXT_LENGTH - length !== 1 ? "s" : ""} (min ${String(MIN_TEXT_LENGTH)}).`;
  }
  if (length > MAX_TEXT_LENGTH) {
    return `Remove ${String(length - MAX_TEXT_LENGTH)} character${length - MAX_TEXT_LENGTH !== 1 ? "s" : ""} (max ${String(MAX_TEXT_LENGTH)}).`;
  }
  return null;
}

export default function GenerateFlow() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const textLength = text.length;
  const validationMessage = lengthError(textLength);
  const canGenerate = textLength >= MIN_TEXT_LENGTH && textLength <= MAX_TEXT_LENGTH && status !== "generating";
  const acceptedCount = candidates.filter((c) => c.status === "accepted").length;

  async function handleGenerate() {
    if (textLength < MIN_TEXT_LENGTH || textLength > MAX_TEXT_LENGTH) return;

    setStatus("generating");
    setSaveError(null);

    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      const data = (await response.json()) as GenerateResponse;
      setCandidates(
        data.candidates.map((c) => ({
          front: c.front,
          back: c.back,
          originalFront: c.front,
          originalBack: c.back,
          status: "pending" as const,
        })),
      );
      setHasGenerated(true);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function updateCandidate(index: number, patch: Partial<Pick<Candidate, "front" | "back">>) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch, status: "accepted" } : c)));
  }

  function acceptCandidate(index: number) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, status: "accepted" } : c)));
  }

  function toggleReject(index: number) {
    setCandidates((prev) =>
      prev.map((c, i) => (i === index ? { ...c, status: c.status === "rejected" ? "pending" : "rejected" } : c)),
    );
  }

  function acceptAll() {
    setCandidates((prev) => prev.map((c) => (c.status === "pending" ? { ...c, status: "accepted" } : c)));
  }

  async function handleSave() {
    const accepted = candidates.filter((c) => c.status === "accepted");
    if (accepted.length === 0) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/flashcards/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: accepted.map((c) => ({
            front: c.front,
            back: c.back,
            source: c.front !== c.originalFront || c.back !== c.originalBack ? "ai_edited" : "ai_generated",
          })),
        }),
      });

      if (!response.ok) {
        setSaveError("Save failed. Please try again.");
        setIsSaving(false);
        return;
      }

      window.location.href = "/flashcards";
    } catch {
      setSaveError("Save failed. Please try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="source-text" className="mb-1 block text-sm text-blue-100/80">
          Source text
        </label>
        <textarea
          id="source-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          rows={8}
          placeholder="Paste text to turn into flashcards (100–10,000 characters)…"
          className={cn(
            "w-full resize-y rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none",
            validationMessage ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          {validationMessage ? (
            <p className="flex items-center gap-1 text-red-300">
              <CircleAlert className="size-3" />
              {validationMessage}
            </p>
          ) : (
            <span className="text-blue-100/40">
              {textLength} / {MAX_TEXT_LENGTH}
            </span>
          )}
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {status === "generating" ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Generating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Generate flashcards
          </span>
        )}
      </Button>

      {status === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-4 shrink-0" />
            Generation failed. Please try again.
          </span>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-200 transition-colors hover:bg-red-500/20"
          >
            <RefreshCw className="size-3.5" />
            Try again
          </button>
        </div>
      )}

      {hasGenerated && status !== "generating" && candidates.length === 0 && (
        <p className="text-center text-sm text-blue-100/60">No candidates found — try different text.</p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-blue-100/80">
              {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
            </h2>
            <button
              type="button"
              onClick={acceptAll}
              className="flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/10"
            >
              <CheckCheck className="size-3.5" />
              Accept all
            </button>
          </div>

          <div className="space-y-3">
            {candidates.map((candidate, index) => (
              <CandidateCard
                key={index}
                candidate={candidate}
                onChangeFront={(value) => {
                  updateCandidate(index, { front: value });
                }}
                onChangeBack={(value) => {
                  updateCandidate(index, { back: value });
                }}
                onAccept={() => {
                  acceptCandidate(index);
                }}
                onToggleReject={() => {
                  toggleReject(index);
                }}
              />
            ))}
          </div>

          <ServerError message={saveError} />

          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={acceptedCount === 0 || isSaving}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-500"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="size-4" />
                Save {acceptedCount} flashcard{acceptedCount !== 1 ? "s" : ""}
              </span>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
