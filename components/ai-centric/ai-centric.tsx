"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { useWindowSize } from "usehooks-ts";
import { useAICentric } from "@/hooks/use-ai-centric";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Chart } from "./chart";
import { MessageSuggestion } from "./message-suggestion";

type AICentricProps = {
  bestNextActionUrl: string;
};

export function AICentric({ bestNextActionUrl }: AICentricProps) {
  const {
    state,
    isSCBAgent,
    isSupportedChartAgent,
    isVisible,
    setState,
    toggleAiCentricCollapsed,
  } = useAICentric();

  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth ? windowWidth < 768 : false;
  const isAiCentricCollapsed = state.isAiCentricCollapsed;

  // biome-ignore lint/suspicious/noConsole: requested debug logs
  console.debug("[DEBUG-AICENTRIC]", "AICentric render", {
    isVisible,
    isMobile,
    windowWidth,
    isSCBAgent,
    isSupportedChartAgent,
    bestNextActionUrlConfigured: Boolean(bestNextActionUrl),
    bestNextActionUrl,
  });


  if (!isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={cn("relative h-full w-full bg-background")}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          {/* Content */}
          <div className="h-full w-full overflow-hidden pt-0">
            {isSCBAgent ? (
              <MessageSuggestion bestNextActionUrl={bestNextActionUrl} />
            ) : isSupportedChartAgent ? (
              <Chart bestNextActionUrl={bestNextActionUrl} />
            ) : null}
          </div>
          <Button
            className="fixed right-4 bottom-4 z-50 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={toggleAiCentricCollapsed}
            size="icon"
            title={isAiCentricCollapsed ? "Expand Panel" : "Collapse Panel"}
            type="button"
            variant="ghost"
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 transition-transform duration-200",
                isAiCentricCollapsed ? "" : "rotate-180"
              )}
            />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}







