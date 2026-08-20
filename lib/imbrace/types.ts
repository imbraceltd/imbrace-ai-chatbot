export type ImbraceBoardField = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  isIdentifier: boolean;
};

export type ImbraceBoard = {
  id: string;
  name: string;
  description: string | null;
  fields: ImbraceBoardField[];
};

export type ImbraceBoardItem = {
  id: string;
  values: Record<string, string>;
};

export type ImbraceDataboardConfig = {
  version: string;
  mode?: "inspect_board" | "create_board" | "add_row";
  focusBoardName?: string;
  focusBoardId?: string;
  visibleFieldIds?: string[];
  notes?: string;
  initialName?: string;
  initialDescription?: string;
};

// AICentric Types
export type ImbraceAIAgent = {
  _id: string;
  doc_name: string;
  title: string;
  organization_id: string;
  short_description: string;
  description: string;
  type: string;
  channel_id: string;
  features: string[];
  thumbnail_url: string;
  hover_thumbnail_url: string;
  tags: string[];
  video_url: string;
  demo_url: string;
  demo_image_url: string;
  how_it_works: { _id: string; title: string; details: string[] }[];
  suggestion_prompts: string[];
  supported_channels: { _id: string; title: string; icon: string }[];
  integrations: { _id: string; title: string; icon: string }[];
  template_id: string;
  assistant_id: string;
  user_id: string;
  is_deleted: boolean;
  isShowWidget?: boolean;
  updated_at: string;
  createdAt: string;
  updatedAt: string;
  created_at: string;
  public_id: string;
};

export type MessageSuggestionContext = {
  contactId: string | null;
  contactName?: string;
  boardId?: string;
  boardItemId?: string;
  conversationId?: string;
};

export type ChartContext = {
  chatId?: string;
  chartData?: unknown;
  chartId?: string;
};
