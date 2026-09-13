import { useState } from "react";
import { Check, CircleAlert, Loader2, Pencil, Trash2, X } from "lucide-react";

const MAX_PREVIEW_LENGTH = 120;
function truncate(text: string) {
  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH)}…` : text;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const fieldBase =
  "w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-60 transition-colors";

export type FlashcardItemMode = "view" | "edit" | "delete-confirm";

export interface FlashcardListItemProps {
  id: string;
  front: string;
  back: string;
  created_at: string;
  mode: FlashcardItemMode;
  isPending: boolean;
  error?: string;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, front: string, back: string) => void;
  onDeleteClick: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}

export function FlashcardListItem({
  id,
  front,
  back,
  created_at,
  mode,
  isPending,
  error,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDeleteClick,
  onCancelDelete,
  onConfirmDelete,
}: FlashcardListItemProps) {
  // The parent remounts this component (via a mode-keyed `key`) whenever a
  // row (re-)enters edit mode, so seeding from props here is enough — a
  // Cancel-then-Edit cycle always starts from the card's current content.
  const [editFront, setEditFront] = useState(front);
  const [editBack, setEditBack] = useState(back);

  const isEditing = mode === "edit";
  const isConfirmingDelete = mode === "delete-confirm";

  return (
    <li className="rounded-xl border border-white/15 bg-white/10 p-4">
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-blue-100/60">Front</label>
            <textarea
              value={editFront}
              disabled={isPending}
              onChange={(e) => {
                setEditFront(e.target.value);
              }}
              rows={2}
              className={fieldBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-blue-100/60">Back</label>
            <textarea
              value={editBack}
              disabled={isPending}
              onChange={(e) => {
                setEditBack(e.target.value);
              }}
              rows={2}
              className={fieldBase}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 disabled:opacity-60"
            >
              <X className="size-3.5" />
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveEdit(id, editFront, editBack);
              }}
              disabled={isPending}
              className="flex items-center gap-1 rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white">{truncate(front)}</p>
            <p className="mt-2 text-xs text-blue-100/50">{dateFormatter.format(new Date(created_at))}</p>
          </div>

          {isConfirmingDelete ? (
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="text-blue-100/70">Confirm delete?</span>
              <button
                type="button"
                onClick={() => {
                  onConfirmDelete(id);
                }}
                disabled={isPending}
                className="flex items-center gap-1 rounded-lg border border-red-400/40 px-2 py-1 text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-60"
              >
                {isPending && <Loader2 className="size-3.5 animate-spin" />}
                Yes
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={isPending}
                className="rounded-lg border border-white/20 px-2 py-1 text-white/70 transition-colors hover:bg-white/10 disabled:opacity-60"
              >
                No
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  onEdit(id);
                }}
                aria-label="Edit flashcard"
                className="rounded-lg border border-white/20 p-1.5 text-white/70 transition-colors hover:bg-white/10"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteClick(id);
                }}
                aria-label="Delete flashcard"
                className="rounded-lg border border-white/20 p-1.5 text-white/70 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </li>
  );
}
