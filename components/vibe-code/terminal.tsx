"use client";

import { TerminalIcon } from "lucide-react";
import { useEffect, useRef } from "react";

interface VibeCodeTerminalProps {
  output: string;
}

/**
 * Simple terminal output display.
 * Shows shell command output from WebContainer actions.
 * For a more interactive terminal, integrate xterm.js later.
 */
export function VibeCodeTerminal({ output }: VibeCodeTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#333] bg-[#252526]">
        <TerminalIcon className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-400">Terminal</span>
      </div>
      {/* Output */}
      <div className="flex-1 overflow-auto p-3">
        {output ? (
          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
            {output}
          </pre>
        ) : (
          <div className="text-xs text-gray-500 font-mono">
            $ Waiting for commands...
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
