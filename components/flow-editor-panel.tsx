"use client";

import { useMemo } from "react";
import { ExternalLink, X } from "lucide-react";
import { useFlowEditor } from "@/hooks/use-flow-editor";
import { env } from "@/lib/env";
import { IMBRACE_ORG_ID_KEY, IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";
import { Button } from "@/components/ui/button";

function buildFlowEditorUrl(flowId: string): string {
  const workflowDomain = env.IMBRACE_WORKFLOW_DOMAIN;
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem(IMBRACE_TOKEN_KEY) ?? ""
      : "";
  const organizationId =
    typeof window !== "undefined"
      ? localStorage.getItem(IMBRACE_ORG_ID_KEY) ?? ""
      : "";
  const lang = "en";

  return `${workflowDomain}/flows/${flowId}?token=${token}&organizationId=${organizationId}&lang=${lang}`;
}

export function FlowEditorPanel() {
  const { state, close } = useFlowEditor();

  const iframeSrc = useMemo(
    () => (state.flowId ? buildFlowEditorUrl(state.flowId) : ""),
    [state.flowId],
  );

  if (!state.isOpen || !state.flowId) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[55dvw] flex-col border-l bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">Configure Workflow</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => window.open(iframeSrc, "_blank")}
            title="Open in new tab"
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={close}
            title="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {state.message && (
        <div className="border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          {state.message}
        </div>
      )}
      <iframe
        src={iframeSrc}
        className="flex-1 border-0"
        allow="clipboard-write"
        title="ActivePieces Flow Editor"
        // @ts-expect-error -- credentialless is a valid HTML attribute for COEP support
        credentialless="true"
      />
    </div>
  );
}
