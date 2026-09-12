import { Check, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type CandidateStatus = "pending" | "accepted" | "rejected";

export interface Candidate {
  front: string;
  back: string;
  originalFront: string;
  originalBack: string;
  status: CandidateStatus;
}

interface CandidateCardProps {
  candidate: Candidate;
  onChangeFront: (value: string) => void;
  onChangeBack: (value: string) => void;
  onAccept: () => void;
  onToggleReject: () => void;
}

const fieldBase =
  "w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-60 transition-colors";

export function CandidateCard({
  candidate,
  onChangeFront,
  onChangeBack,
  onAccept,
  onToggleReject,
}: CandidateCardProps) {
  const { front, back, status } = candidate;
  const isRejected = status === "rejected";
  const isAccepted = status === "accepted";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-opacity",
        isRejected ? "border-white/10 bg-white/5 opacity-50" : "border-white/15 bg-white/10",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            isRejected
              ? "bg-white/10 text-white/50"
              : isAccepted
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-blue-500/20 text-blue-200",
          )}
        >
          {isRejected ? "Rejected" : isAccepted ? "Accepted" : "Pending"}
        </span>
        <div className="flex gap-2">
          {!isAccepted && (
            <button
              type="button"
              onClick={onAccept}
              className="flex items-center gap-1 rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              <Check className="size-3.5" />
              Accept
            </button>
          )}
          <button
            type="button"
            onClick={onToggleReject}
            className="flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
          >
            {isRejected ? (
              <>
                <RotateCcw className="size-3.5" />
                Undo
              </>
            ) : (
              <>
                <X className="size-3.5" />
                Reject
              </>
            )}
          </button>
        </div>
      </div>

      <label className="mb-1 block text-xs text-blue-100/60">Front</label>
      <textarea
        value={front}
        disabled={isRejected}
        onChange={(e) => {
          onChangeFront(e.target.value);
        }}
        rows={2}
        className={cn(fieldBase, "mb-3")}
      />

      <label className="mb-1 block text-xs text-blue-100/60">Back</label>
      <textarea
        value={back}
        disabled={isRejected}
        onChange={(e) => {
          onChangeBack(e.target.value);
        }}
        rows={2}
        className={fieldBase}
      />
    </div>
  );
}
