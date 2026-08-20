"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";

export type ToolApprovalProps = {
  toolName: string;
  /** Called when the user approves (true) or denies (false). The parent
   * should resolve the SDK's approval request via addToolApprovalResponse. */
  onDecision: (approved: boolean) => void;
  /** Optional display label; defaults to the tool name. */
  title?: string;
  /** Tool-call input shown to the user so they can verify what's about to
   * run before approving. Renders nothing when undefined or empty object. */
  input?: unknown;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatPrimitive(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "—";
  return JSON.stringify(v);
}

/**
 * Inline approval prompt rendered inside a paused tool block. The server
 * marked this tool as `needsApproval: true`, so the AI SDK is waiting on
 * `addToolApprovalResponse({ id, approved })` before the executor runs.
 */
export const ToolApproval = ({
  toolName,
  onDecision,
  title,
  input,
}: ToolApprovalProps) => {
  const [submitted, setSubmitted] = useState(false);

  const handle = (approved: boolean) => {
    if (submitted) return;
    setSubmitted(true);
    onDecision(approved);
  };

  // Reason: render flat key/value rows for simple inputs so the user can
  // sanity-check params; fall back to a JSON dump for nested or non-object
  // shapes. Hidden when there are no params.
  const renderInput = () => {
    if (input === undefined || input === null) return null;

    if (isPlainObject(input)) {
      const entries = Object.entries(input);
      if (entries.length === 0) return null;
      const allPrimitive = entries.every(
        ([, v]) => v === null || ["string", "number", "boolean"].includes(typeof v),
      );

      if (allPrimitive) {
        return (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs font-mono">
            {entries.map(([k, v]) => (
              <Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all text-foreground">{formatPrimitive(v)}</dd>
              </Fragment>
            ))}
          </dl>
        );
      }
    }

    return (
      <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-xs font-mono">
        {JSON.stringify(input, null, 2)}
      </pre>
    );
  };

  return (
    <div className="flex flex-col gap-3 border-t bg-muted/30 p-4">
      <div className="text-sm">
        Run <span className="font-mono font-medium">{title ?? toolName}</span>?
      </div>
      {renderInput()}
      <div className="flex gap-2">
        <Button
          disabled={submitted}
          onClick={() => handle(true)}
          size="sm"
          variant="default"
        >
          <CheckIcon className="size-4" />
          Approve
        </Button>
        <Button
          disabled={submitted}
          onClick={() => handle(false)}
          size="sm"
          variant="outline"
        >
          <XIcon className="size-4" />
          Deny
        </Button>
      </div>
    </div>
  );
};
