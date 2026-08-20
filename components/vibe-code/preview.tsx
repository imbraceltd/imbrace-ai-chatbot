"use client";

import { Globe, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useRef } from "react";

interface VibeCodePreviewProps {
  url: string | null;
}

export function VibeCodePreview({ url }: VibeCodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && url) {
      iframeRef.current.src = url;
    }
  }, [url]);

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-sm">Waiting for dev server to start...</span>
        <span className="text-xs">
          The preview will appear here once the application is running.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
          {url}
        </span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Refresh preview"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      {/* iframe */}
      <iframe
        ref={iframeRef}
        src={url}
        className="flex-1 w-full border-0"
        title="App Preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allow="cross-origin-isolated"
      />
    </div>
  );
}
