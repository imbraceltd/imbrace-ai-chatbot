"use client";

import { XIcon } from "lucide-react";
import {
  dismissScopedBoard,
  useScopedBoardId,
  useScopedDataboard,
} from "@/hooks/use-databoard";

/**
 * Status chip rendered between the prompt suggestions and the message input
 * when the chat is locked to a databoard (URL `?databoardId=…`). Tells the
 * user which board the agent is currently scoped to and exposes an X to
 * leave that scope mid-conversation.
 *
 * Dismissing:
 *  - removes `IMBRACE_BOARD_ID_KEY` from localStorage so subsequent chat
 *    requests omit `board_id` (the chat transport reads localStorage on
 *    each request);
 *  - dispatches `IMBRACE_TOKEN_UPDATED_EVENT` so the in-tab listeners in
 *    `useScopedBoardId` re-read and stop the mutation broadcast / scoped
 *    SWR fetches;
 *  - hides itself.
 */
export const DataboardScopeChip = () => {
  // Reason: chip visibility is gated on the *active* scope, not the stored
  // id. After the user clicks X, useScopedBoardId returns null even though
  // the stored id sticks around so the BoardSelector can surface it for
  // re-engagement.
  const activeBoardId = useScopedBoardId();
  const { board } = useScopedDataboard();

  if (!activeBoardId) return null;

  const boardName =
    board?.name && board.name.trim().length > 0 ? board.name.trim() : null;

  const handleDismiss = () => {
    dismissScopedBoard();
  };

  return (
    // Reason: chip is styled to read as a header that "grows out of" the
    // MultimodalInput below — same width (parent caps at max-w-4xl), top
    // corners rounded to match the input's `rounded-xl`, no bottom border
    // and `-mb-2` so it sits flush against the input (the parent uses
    // `gap-2` between children, which we cancel here).
    <div className="-mb-3 flex w-full items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border bg-muted/30 px-3 py-1.5 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">
        Interacting with databoard{" "}
        <span className="font-medium text-foreground">
          {boardName ?? activeBoardId}
        </span>
      </span>
      <button
        aria-label="Stop scoping to this databoard"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={handleDismiss}
        type="button"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
};
