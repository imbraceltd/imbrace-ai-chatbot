"use client";

import { useNavigate } from "react-router-dom";
import { memo, useCallback } from "react";
import { Maximize2 } from "lucide-react";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { AgentSelector, type ImbraceAgent } from "./agent-selector";
import { BoardSelector } from "./board-selector";
import { useAppMode } from "@/hooks/use-app-mode";
import {
  IMBRACE_TOKEN_KEY,
  IMBRACE_ORG_ID_KEY,
  AGENT_DEMO_AGENT_ID_KEY,
} from "@/lib/imbrace/constants";

function PureChatHeader({
  initialAssistantId,
  isReadonly,
  selectedAgent,
  onAgentChange,
}: {
  initialAssistantId: string | null;
  isReadonly: boolean;
  selectedAgent: ImbraceAgent | null;
  onAgentChange: (agent: ImbraceAgent | null) => void;
}) {
  const navigate = useNavigate();
  const { mode, agentDemoAgentId, expandable } = useAppMode();
  const isAgentDemo = mode === "agentDemo";

  const handleExpand = useCallback(() => {
    const url = new URL(window.location.href);
    const token = window.localStorage.getItem(IMBRACE_TOKEN_KEY);
    const orgId = window.localStorage.getItem(IMBRACE_ORG_ID_KEY);

    url.searchParams.delete("isAgentDemo");
    if (token) url.searchParams.set("imbraceToken", token);
    if (orgId) url.searchParams.set("organizationId", orgId);
    if (agentDemoAgentId) url.searchParams.set("agentId", agentDemoAgentId);

    window.open(url.toString(), "_blank");
  }, [agentDemoAgentId]);

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      {!isAgentDemo && (
        <>
          <SidebarToggle />

          <Button
            className="order-2 h-8 px-2 md:order-1 md:h-fit md:px-2"
            onClick={() => {
              navigate("/");
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        </>
      )}

      {!isReadonly && (
        <>
          <AgentSelector
            className="order-2 md:order-3"
            disabled={isAgentDemo}
            initialAssistantId={initialAssistantId}
            onAgentChange={onAgentChange}
            selectedAgent={selectedAgent}
          />
          {/* Reason: only renders when chat is scoped to a board (URL
              `?databoardId=…`). Lets the user switch among same-type
              sibling boards without leaving the chat. */}
          <BoardSelector className="order-3 md:order-4" />
        </>
      )}

      {isAgentDemo && expandable && (
        <Button
          variant="ghost"
          size="icon"
          className="order-last ml-auto h-8 w-8"
          onClick={handleExpand}
        >
          <Maximize2 className="size-4" />
        </Button>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.initialAssistantId === nextProps.initialAssistantId &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.selectedAgent?._id === nextProps.selectedAgent?._id
  );
});
