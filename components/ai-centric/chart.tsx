"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAICentric } from "@/hooks/use-ai-centric";
import {
  IMBRACE_ORG_ID_KEY,
  IMBRACE_TOKEN_KEY,
} from "@/lib/imbrace/constants";
import type { ChartContext } from "@/lib/imbrace/types";

type ChartProps = {
  bestNextActionUrl: string;
};

export function Chart({ bestNextActionUrl }: ChartProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { state } = useAICentric();
  const { chartContext } = state;

  // Function to send chart context to iframe
  const sendChartContextToIframe = useCallback(
    (context: ChartContext) => {
      if (!iframeRef.current || !bestNextActionUrl) {
        return;
      }

      const message = {
        type: "CHART",
        event: "SEND_CHART_CONTEXT_TO_NEXT_BEST_ACTION",
        data: {
          chatId: context.chatId,
          chartId: context.chartId,
          chartData: context.chartData,
        },
      };

      iframeRef.current.contentWindow?.postMessage(message, bestNextActionUrl);
    },
    [bestNextActionUrl]
  );

  // Send context when it changes
  useEffect(() => {
    if (chartContext) {
      console.log("Sending chart context to iframe", chartContext);
      sendChartContextToIframe(chartContext);
    }
  }, [chartContext, sendChartContextToIframe]);

  // Handle messages from iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from our iframe origin
      if (event.origin !== bestNextActionUrl) {
        return;
      }

      // Handle chart-related events here if needed
      // const { type, event: eventType, data } = event.data;
    },
    [bestNextActionUrl]
  );

  useEffect(() => {
    // Add message listener
    window.addEventListener("message", handleMessage);

    return () => {
      // Clean up message listener
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  // Send initial message to iframe when it loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      if (chartContext?.chatId) {
        sendChartContextToIframe(chartContext);
      }
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
    };
  }, [chartContext, sendChartContextToIframe]);

  const imbraceToken =
    typeof window !== "undefined"
      ? localStorage.getItem(IMBRACE_TOKEN_KEY)
      : null;

  const imbraceOrgId =
    typeof window !== "undefined"
      ? localStorage.getItem(IMBRACE_ORG_ID_KEY)
      : null;

  if (!bestNextActionUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-800">
        <div className="text-center">
          <div className="text-lg text-gray-500 dark:text-gray-400">
            Chart Panel
          </div>
          <div className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            URL not configured
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <iframe
        ref={iframeRef}
        className="h-full w-full border-none"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        src={`${bestNextActionUrl}/chart?token=${imbraceToken}&organizationId=${imbraceOrgId}`}
        title="Chart Panel"
      />
    </div>
  );
}







