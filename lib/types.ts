import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { getWeather } from "./ai/tools/get-weather";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
  echartId: z.string().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: { input: Record<string, unknown>; output: Record<string, unknown> };
  updateDocument: { input: Record<string, unknown>; output: Record<string, unknown> };
};

export type CustomUIDataTypes = {
  // New stream payload format:
  // - data-kind/data-id/data-title: { value, chatId }
  // - delta events: { value, chatId }
  // - data-clear/data-finish: { chatId }
  //
  // NOTE: we keep some union types for backward-compat with older streams.
  textDelta: { value: string; chatId: string } | string;
  imageDelta: { value: string; chatId: string } | string;
  sheetDelta: { value: string; chatId: string } | string;
  codeDelta: { value: string; chatId: string } | string;
  imbraceDataboardInit: { value: any; chatId: string } | any;
  "flow-editor-open": { flowId: string; message: string; chatId: string };
  vibeCodeDelta: {
    action: string;
    actionId?: string;
    actionType?: string;
    artifactId?: string;
    filePath?: string;
    content?: string;
    title?: string;
    chatId: string;
  };
  appendMessage: string;
  id: { value: string; chatId: string } | string;
  "chat-title": string;
  title: { value: string; chatId: string } | string;
  kind: { value: ArtifactKind; chatId: string } | ArtifactKind;
  clear: { chatId: string } | null;
  finish: { chatId: string } | null;
  usage: AppUsage;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
