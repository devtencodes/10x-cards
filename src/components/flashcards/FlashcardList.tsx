import { useState } from "react";
import { FlashcardListItem, type FlashcardItemMode } from "@/components/flashcards/FlashcardListItem";

export interface FlashcardListCard {
  id: string;
  front: string;
  back: string;
  created_at: string;
}

interface FlashcardListProps {
  cards: FlashcardListCard[];
}

interface PatchResponse {
  front: string;
  back: string;
  updated_at: string;
}

interface ErrorResponse {
  error?: string;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorResponse | null;
  return body?.error ?? fallback;
}

export default function FlashcardList({ cards: initialCards }: FlashcardListProps) {
  const [cards, setCards] = useState<FlashcardListCard[]>(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"edit" | "delete-confirm" | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearError(id: string) {
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id));
    });
  }

  function handleEdit(id: string) {
    setActiveId(id);
    setActiveMode("edit");
    clearError(id);
  }

  function handleCancelEdit() {
    setActiveId(null);
    setActiveMode(null);
  }

  function handleDeleteClick(id: string) {
    setActiveId(id);
    setActiveMode("delete-confirm");
    clearError(id);
  }

  function handleCancelDelete() {
    setActiveId(null);
    setActiveMode(null);
  }

  async function handleSaveEdit(id: string, front: string, back: string) {
    setPendingId(id);
    clearError(id);

    try {
      const response = await fetch(`/api/flashcards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Update failed. Please try again.");
        setErrors((prev) => ({ ...prev, [id]: message }));
        return;
      }

      const data = (await response.json()) as PatchResponse;
      setCards((prev) => prev.map((card) => (card.id === id ? { ...card, front: data.front, back: data.back } : card)));
      setActiveId(null);
      setActiveMode(null);
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Update failed. Please try again." }));
    } finally {
      setPendingId(null);
    }
  }

  async function handleConfirmDelete(id: string) {
    setPendingId(id);
    clearError(id);

    try {
      const response = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Delete failed. Please try again.");
        setErrors((prev) => ({ ...prev, [id]: message }));
        return;
      }

      setCards((prev) => prev.filter((card) => card.id !== id));
      setActiveId(null);
      setActiveMode(null);
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Delete failed. Please try again." }));
    } finally {
      setPendingId(null);
    }
  }

  if (cards.length === 0) {
    return (
      <p className="text-center text-sm text-blue-100/60">
        No flashcards yet.{" "}
        <a href="/generate" className="text-purple-300 hover:underline">
          Generate some
        </a>
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {cards.map((card) => {
        const mode: FlashcardItemMode = activeId === card.id ? (activeMode ?? "view") : "view";

        return (
          <FlashcardListItem
            // Remount on mode change (rather than syncing edit-draft state via
            // an effect) so entering edit mode always seeds fresh textareas
            // from the card's current front/back.
            key={`${card.id}:${mode}`}
            id={card.id}
            front={card.front}
            back={card.back}
            created_at={card.created_at}
            mode={mode}
            isPending={pendingId === card.id}
            error={errors[card.id]}
            onEdit={handleEdit}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={(id, front, back) => {
              void handleSaveEdit(id, front, back);
            }}
            onDeleteClick={handleDeleteClick}
            onCancelDelete={handleCancelDelete}
            onConfirmDelete={(id) => {
              void handleConfirmDelete(id);
            }}
          />
        );
      })}
    </ul>
  );
}
