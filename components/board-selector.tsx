"use client";

import { useMemo, useState } from "react";
import { LayoutGridIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckCircleFillIcon, ChevronDownIcon } from "./icons";
import {
  setScopedBoardId,
  useScopeDismissed,
  useScopedDataboard,
  useScopedDataboardSiblings,
} from "@/hooks/use-databoard";

function normalizeQuery(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * In-chat board switcher. Renders only when the chat is scoped to a
 * databoard (URL `?databoardId=…`). The dropdown lists sibling boards of
 * the same `type` as the currently scoped board. Picking a board updates
 * `localStorage[IMBRACE_BOARD_ID_KEY]` and notifies in-tab listeners so:
 *
 *  - subsequent `/ai-agent/v2/chat` requests carry the new `board_id`,
 *  - the scope chip and greeting refresh,
 *  - the mutation broadcast hook re-keys.
 */
export const BoardSelector = ({
  className,
}: { className?: string } = {}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Reason: use `useScopedDataboard` (stored id) rather than the active
  // scope so the selector stays visible after the user dismisses the chip
  // via X — they can still pick another board to re-engage scope.
  const { boardId } = useScopedDataboard();
  const dismissed = useScopeDismissed();
  const {
    boards,
    type,
    isLoading,
    error,
  } = useScopedDataboardSiblings();

  const filtered = useMemo(() => {
    const q = normalizeQuery(query);
    if (!q) return boards;
    return boards.filter((b) => {
      const haystack = normalizeQuery(
        [b.name, b.description, b.id].filter(Boolean).join(" "),
      );
      return haystack.includes(q);
    });
  }, [boards, query]);

  // Reason: the selector is the *re-engage* affordance after the user
  // dismissed the scope chip. While scope is active, the chip already
  // names the board — showing the selector too would be redundant. Hide
  // entirely when there's no stored board (user never had scope) or when
  // scope is currently active (chip is visible instead).
  if (!boardId || !dismissed) return null;

  // While dismissed, just say "Select board" — the previously-scoped name
  // would only confuse the user (it suggests scope is still active).
  const triggerLabel = "Select board";

  return (
    <DropdownMenu
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
      open={open}
    >
      <DropdownMenuTrigger
        asChild
        className={cn(
          "w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className,
        )}
      >
        <Button
          className="h-8 gap-1 md:h-fit md:px-2"
          data-testid="board-selector"
          variant="outline"
        >
          <LayoutGridIcon className="size-4" />
          <span className="max-w-[120px] truncate md:max-w-[200px]">
            {triggerLabel}
          </span>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-[400px] w-[min(90vw,320px)] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-popover p-1">
          <label className="sr-only" htmlFor="board-selector-search">
            Search boards
          </label>
          <Input
            autoFocus
            id="board-selector-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Prevent Radix typeahead from stealing focus on space.
              event.stopPropagation();
            }}
            placeholder="Search boards"
            type="search"
            value={query}
          />
        </div>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading boards…</DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled>Failed to fetch boards</DropdownMenuItem>
        ) : !type ? (
          // Reason: we need the scoped board's type to filter siblings;
          // until the metadata fetch lands, show a placeholder rather than
          // an empty list (which the user could mistake for "no results").
          <DropdownMenuItem disabled>Loading scope…</DropdownMenuItem>
        ) : boards.length === 0 ? (
          <DropdownMenuItem disabled>No boards available</DropdownMenuItem>
        ) : filtered.length === 0 ? (
          <DropdownMenuItem disabled>No matching boards</DropdownMenuItem>
        ) : (
          filtered.map((b) => (
            <DropdownMenuItem
              className="group/item flex flex-row items-center justify-between gap-4"
              data-active={!dismissed && b.id === boardId}
              data-testid={`board-selector-item-${b.id}`}
              key={b.id}
              onSelect={() => {
                if (!b.id) {
                  setOpen(false);
                  return;
                }
                // Always call setScopedBoardId — re-engages scope when
                // dismissed, even if picking the same board id.
                if (dismissed || b.id !== boardId) {
                  setScopedBoardId(b.id);
                }
                setOpen(false);
              }}
            >
              <div className="flex flex-col items-start gap-1">
                <span className="max-w-[240px] truncate font-medium">
                  {b.name?.trim() || b.id}
                </span>
                {b.description && (
                  <div className="line-clamp-2 text-muted-foreground text-xs">
                    {b.description}
                  </div>
                )}
              </div>
              <div className="text-foreground opacity-0 group-data-[active=true]/item:opacity-100 dark:text-foreground">
                <CheckCircleFillIcon />
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
