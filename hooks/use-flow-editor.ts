"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

export type FlowEditorState = {
  isOpen: boolean;
  flowId: string;
  message: string;
};

const initialState: FlowEditorState = {
  isOpen: false,
  flowId: "",
  message: "",
};

export function useFlowEditor() {
  const { data, mutate } = useSWR<FlowEditorState>("flow-editor", null, {
    fallbackData: initialState,
  });

  const state = data ?? initialState;

  const open = useCallback(
    (params: { flowId: string; message: string }) => {
      mutate({ isOpen: true, ...params }, { revalidate: false });
    },
    [mutate],
  );

  const close = useCallback(() => {
    mutate(initialState, { revalidate: false });
  }, [mutate]);

  return useMemo(() => ({ state, open, close }), [state, open, close]);
}
