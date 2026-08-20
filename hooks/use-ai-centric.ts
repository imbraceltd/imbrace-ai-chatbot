"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type {
  ChartContext,
  MessageSuggestionContext,
} from "@/lib/imbrace/types";
import { CHART_AGENT_IDS, SCB_AGENT_ID } from "@/lib/imbrace/constants";

function debugAiCentric(event: string, data?: unknown) {
  // biome-ignore lint/suspicious/noConsole: requested debug logs
  console.debug("[DEBUG-AICENTRIC]", event, data ?? "");
}

export type AICentricState = {
  isVisible: boolean;
  isAiCentricCollapsed: boolean;
  currentAgentId: string | null;
  enableEchart: boolean;
  isScb: boolean;
  messageSuggestionContext: MessageSuggestionContext;
  chartContext: ChartContext;
  isNewChatWithAiCentricInit: boolean;
};

export const initialAICentricState: AICentricState = {
  isVisible: false,
  isAiCentricCollapsed: false,
  currentAgentId: null,
  enableEchart: false,
  isScb: false,
  messageSuggestionContext: {
    contactId: null,
    contactName: "",
    boardId: undefined,
    boardItemId: undefined,
    conversationId: undefined,
  },
  chartContext: {
    chatId: undefined,
    chartData: undefined,
    chartId: undefined,
  },
  isNewChatWithAiCentricInit: false,
};

type Selector<T> = (state: AICentricState) => T;

export function useAICentricSelector<Selected>(selector: Selector<Selected>) {
  const { data: localState } = useSWR<AICentricState>("ai-centric", null, {
    fallbackData: initialAICentricState,
  });

  const selectedValue = useMemo(() => {
    if (!localState) {
      return selector(initialAICentricState);
    }
    return selector(localState);
  }, [localState, selector]);

  return selectedValue;
}

export function useAICentric() {
  const { data: localState, mutate: setLocalState } = useSWR<AICentricState>(
    "ai-centric",
    null,
    {
      fallbackData: initialAICentricState,
    }
  );

  const state = useMemo(() => {
    if (!localState) {
      return initialAICentricState;
    }
    return localState;
  }, [localState]);

  const setState = useCallback(
    (
      updaterFn: AICentricState | ((current: AICentricState) => AICentricState)
    ) => {
      setLocalState((currentState) => {
        const stateToUpdate = currentState ?? initialAICentricState;

        if (typeof updaterFn === "function") {
          return updaterFn(stateToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalState]
  );

  const setMessageSuggestionContext = useCallback(
    (context: MessageSuggestionContext) => {
      setState((current) => ({
        ...current,
        messageSuggestionContext: context,
      }));
    },
    [setState]
  );

  const setChartContext = useCallback(
    (context: ChartContext) => {
      setState((current) => ({
        ...current,
        chartContext: context,
      }));
    },
    [setState]
  );

  const setCurrentAgentId = useCallback(
    (
      agentId: string | null,
      options?: { enableEchart?: boolean; isScb?: boolean }
    ) => {
      const enableEchart = options?.enableEchart ?? false;
      const isScb = options?.isScb ?? false;
      const isChart = agentId
        ? CHART_AGENT_IDS.includes(agentId) || enableEchart
        : false;
      // SCB panel shows when the agent is flagged via metadata.is_scb
      // (preferred) or matches the legacy hardcoded SCB_AGENT_ID.
      const isScbAgent = agentId ? agentId === SCB_AGENT_ID || isScb : false;
      const nextIsVisible = agentId ? isScbAgent || isChart : false;

      debugAiCentric("setCurrentAgentId", {
        agentId,
        SCB_AGENT_ID,
        isScb,
        isScbAgent,
        isChart,
        enableEchart,
        nextIsVisible,
      });

      setState((current) => ({
        ...current,
        currentAgentId: agentId,
        enableEchart,
        isScb,
        isVisible: nextIsVisible,
      }));
    },
    [setState]
  );

  const setIsNewChatWithAiCentricInit = useCallback(
    (value: boolean) => {
      setState((current) => ({
        ...current,
        isNewChatWithAiCentricInit: value,
      }));
    },
    [setState]
  );

  const setIsAiCentricCollapsed = useCallback(
    (value: boolean) => {
      debugAiCentric("setIsAiCentricCollapsed", { value });
      setState((current) => ({
        ...current,
        isAiCentricCollapsed: value,
      }));
    },
    [setState]
  );

  const toggleAiCentricCollapsed = useCallback(() => {
    setState((current) => {
      const next = !current.isAiCentricCollapsed;
      debugAiCentric("toggleAiCentricCollapsed", { next });
      return { ...current, isAiCentricCollapsed: next };
    });
  }, [setState]);

  const isSCBAgent = useMemo(() => {
    return state.currentAgentId === SCB_AGENT_ID || state.isScb;
  }, [state.currentAgentId, state.isScb]);

  const isSupportedChartAgent = useMemo(() => {
    return (
      state.currentAgentId !== null &&
      (CHART_AGENT_IDS.includes(state.currentAgentId) || state.enableEchart)
    );
  }, [state.currentAgentId, state.enableEchart]);

  return useMemo(
    () => ({
      state,
      setState,
      setMessageSuggestionContext,
      setChartContext,
      setCurrentAgentId,
      setIsNewChatWithAiCentricInit,
      setIsAiCentricCollapsed,
      toggleAiCentricCollapsed,
      isSCBAgent,
      isSupportedChartAgent,
      isVisible: state.isVisible,
    }),
    [
      state,
      setState,
      setMessageSuggestionContext,
      setChartContext,
      setCurrentAgentId,
      setIsNewChatWithAiCentricInit,
      setIsAiCentricCollapsed,
      toggleAiCentricCollapsed,
      isSCBAgent,
      isSupportedChartAgent,
    ]
  );
}







