"use client";

import { useMemo, useState } from "react";
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
import {
  CheckCircleFillIcon,
  ChevronDownIcon,
  SparklesIcon,
} from "./icons";
import { useAgentStore, type ImbraceAgent } from "@/hooks/use-agent-store";
import { useTranslation } from "@/lib/i18n/client";

// Re-export ImbraceAgent type for backward compatibility
export type { ImbraceAgent } from "@/hooks/use-agent-store";

function normalizeQuery(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function AgentSelector({
  className,
  initialAssistantId: _initialAssistantId,
  selectedAgent,
  onAgentChange,
  disabled,
}: {
  initialAssistantId: string | null;
  selectedAgent: ImbraceAgent | null;
  onAgentChange: (agent: ImbraceAgent | null) => void;
  disabled?: boolean;
} & React.ComponentProps<typeof Button>) {
  const { t } = useTranslation("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { agents, isLoading, error } = useAgentStore();

  const filteredAgents = useMemo(() => {
    const normalizedQuery = normalizeQuery(query);
    if (normalizedQuery.length === 0) {
      return agents;
    }

    return agents.filter((agent) => {
      const haystack = normalizeQuery(
        [agent.title, agent.short_description].filter(Boolean).join(" ")
      );
      return haystack.includes(normalizedQuery);
    });
  }, [agents, query]);

  return (
    <DropdownMenu
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
      open={disabled ? false : open}
    >
      <DropdownMenuTrigger
        asChild
        className={cn(
          "w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
          className
        )}
      >
        <Button
          className="h-8 gap-1 md:h-fit md:px-2"
          data-testid="agent-selector"
          disabled={disabled}
          variant="outline"
        >
          <SparklesIcon size={16} />
          <span className="max-w-[120px] truncate md:max-w-[200px]">
            {selectedAgent?.title ?? t("Chat.selectAgentPlaceholder")}
          </span>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[min(90vw,320px)] max-h-[400px] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-popover p-1">
          <label className="sr-only" htmlFor="agent-selector-search">
            {t("Chat.searchAgentsLabel")}
          </label>
          <Input
            autoFocus
            id="agent-selector-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Prevent Radix DropdownMenu typeahead from stealing focus
              event.stopPropagation();
            }}
            placeholder={t("Chat.searchAgentsPlaceholder")}
            type="search"
            value={query}
          />
        </div>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>{t("Chat.loadingAgents")}</DropdownMenuItem>
        ) : error ? (
          <DropdownMenuItem disabled>{t("Chat.failedToFetchAgents")}</DropdownMenuItem>
        ) : agents.length === 0 ? (
          <DropdownMenuItem disabled>{t("Chat.noAgentsAvailable")}</DropdownMenuItem>
        ) : filteredAgents.length === 0 ? (
          <DropdownMenuItem disabled>{t("Chat.noMatchingAgents")}</DropdownMenuItem>
        ) : (
          filteredAgents.map((agent) => (
            <DropdownMenuItem
              className="group/item flex flex-row items-center justify-between gap-4"
              data-active={agent._id === selectedAgent?._id}
              data-testid={`agent-selector-item-${agent._id}`}
              key={agent._id}
              onSelect={() => {
                onAgentChange(agent);
                setOpen(false);
              }}
            >
              <div className="flex flex-col items-start gap-1">
                <span className="max-w-[240px] truncate font-medium">
                  {agent.title}
                </span>
                {agent.short_description && (
                  <div className="text-muted-foreground text-xs line-clamp-2">
                    {agent.short_description}
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
}

