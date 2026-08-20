import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  ImbraceBoard,
  ImbraceBoardField,
  ImbraceBoardItem,
  ImbraceDataboardConfig,
} from "@/lib/imbrace/types";
import { IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";

type RequestStatus = "idle" | "loading" | "error";

type DataboardMetadata = {
  requestLabel: string;
  boards: ImbraceBoard[];
  boardItems: ImbraceBoardItem[];
  boardsStatus: RequestStatus;
  boardItemsStatus: RequestStatus;
  selectedBoardId: string | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
};

const defaultMetadata: DataboardMetadata = {
  requestLabel: "",
  boards: [],
  boardItems: [],
  boardsStatus: "idle",
  boardItemsStatus: "idle",
  selectedBoardId: null,
  lastSyncedAt: null,
  errorMessage: null,
};

type SetMetadata = Dispatch<SetStateAction<DataboardMetadata>>;

type ApiResponse<T> = {
  data: T;
  count?: number;
  total?: number;
  hasMore?: boolean;
};

function parseConfig(content: string): ImbraceDataboardConfig {
  if (!content) {
    return { version: "1" };
  }

  try {
    const raw = JSON.parse(content) as Partial<ImbraceDataboardConfig>;
    return {
      version: "1",
      ...raw,
    };
  } catch {
    return { version: "1" };
  }
}

async function apiRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(IMBRACE_TOKEN_KEY) : null;

  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token && !headers.has("x-access-token")) {
    headers.set("x-access-token", token);
  }

  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers,
  });

  if (!response.ok) {
    try {
      const errorBody = await response.json();
      const message =
        errorBody?.message || errorBody?.cause || response.statusText;
      throw new Error(message);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(response.statusText || "Request failed");
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function fetchBoards() {
  const result = await apiRequest<ApiResponse<ImbraceBoard[]>>(
    "/api/v2/backend/databoards"
  );
  return result.data;
}

async function fetchBoardItems(boardId: string) {
  const result = await apiRequest<ApiResponse<ImbraceBoardItem[]>>(
    `/api/v2/backend/databoards/${boardId}/items`
  );
  return result.data;
}

async function refreshBoardItems(
  setMetadata: SetMetadata,
  boardId: string
) {
  setMetadata((prev) => ({
    ...prev,
    selectedBoardId: boardId,
    boardItemsStatus: "loading",
    errorMessage: null,
  }));

  try {
    const items = await fetchBoardItems(boardId);
    setMetadata((prev) => ({
      ...prev,
      boardItems: items,
      boardItemsStatus: "idle",
      errorMessage: null,
      selectedBoardId: boardId,
    }));
  } catch (error) {
    setMetadata((prev) => ({
      ...prev,
      boardItemsStatus: "error",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unable to load board items.",
    }));
    throw error;
  }
}

async function refreshBoardsList(
  setMetadata: SetMetadata,
  { keepSelection }: { keepSelection?: boolean } = {}
) {
  setMetadata((prev) => ({
    ...prev,
    boardsStatus: "loading",
    errorMessage: null,
  }));

  try {
    const boards = await fetchBoards();
    let nextSelectedBoardId: string | null = null;

    setMetadata((prev) => {
      const canKeepSelection =
        keepSelection &&
        prev.selectedBoardId &&
        boards.some((board) => board.id === prev.selectedBoardId);

      // Do not auto-select the first board anymore.
      // Only keep selection if explicitly requested and valid.
      const nextSelectedBoardId = canKeepSelection
        ? (prev.selectedBoardId as string)
        : null;

      return {
        ...prev,
        boards,
        boardsStatus: "idle",
        selectedBoardId: nextSelectedBoardId,
        lastSyncedAt: new Date().toISOString(),
        errorMessage: null,
        boardItems:
          canKeepSelection && prev.selectedBoardId === nextSelectedBoardId
            ? prev.boardItems
            : [],
        boardItemsStatus:
          !nextSelectedBoardId || canKeepSelection
            ? prev.boardItemsStatus
            : "loading",
      };
    });

    if (nextSelectedBoardId) {
      await refreshBoardItems(setMetadata, nextSelectedBoardId);
    }
  } catch (error) {
    setMetadata((prev) => ({
      ...prev,
      boardsStatus: "error",
      errorMessage:
        error instanceof Error ? error.message : "Unable to load boards.",
    }));
    throw error;
  }
}

function BoardFieldInputs({
  fields,
  values,
  onChange,
  prefix,
  disabled,
}: {
  fields: ImbraceBoardField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  prefix: string;
  disabled?: boolean;
}) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This board does not have any fields yet.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <div className="flex flex-col gap-2" key={`${prefix}-${field.id}`}>
          <Label htmlFor={`${prefix}-${field.id}`}>
            {field.name}
            {field.isIdentifier ? (
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                Identifier
              </span>
            ) : null}
          </Label>

          <Input
            id={`${prefix}-${field.id}`}
            type={
              field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "date"
                  : field.type === "datetime"
                    ? "datetime-local"
                    : "text"
            }
            value={values[field.id] ?? ""}
            placeholder={field.description ?? field.name}
            disabled={disabled}
            onChange={(event) => onChange(field.id, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function SectionStatus({
  status,
  children,
}: {
  status: RequestStatus;
  children: React.ReactNode;
}) {
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderIcon />
        <span>Loading...</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-sm text-destructive">
        Something went wrong. Please try again.
      </div>
    );
  }

  return <>{children}</>;
}

function ImbraceDataboardContent({
  metadata,
  setMetadata,
  content,
}: {
  metadata: DataboardMetadata | null;
  setMetadata: SetMetadata;
  content: string;
}) {
  const state = metadata ?? defaultMetadata;
  const config = useMemo(() => parseConfig(content), [content]);

  const mode = config.mode ?? "inspect_board";
  const isCreateBoardMode = mode === "create_board";
  const isAddRowMode = mode === "add_row";

  const selectedBoard = state.boards.find(
    (board) => board.id === state.selectedBoardId
  );

  const [boardForm, setBoardForm] = useState({
    name: "",
    description: "",
  });
  const [newBoardForm, setNewBoardForm] = useState({
    name: "",
    description: "",
  });
  const [newItemValues, setNewItemValues] = useState<Record<string, string>>(
    {}
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [isUpdatingBoard, setIsUpdatingBoard] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null);

  useEffect(() => {
    if (!metadata) {
      setMetadata(defaultMetadata);
    }
  }, [metadata, setMetadata]);

  useEffect(() => {
    if (config.mode === "create_board") {
      if (config.initialName || config.initialDescription) {
        setNewBoardForm((prev) => ({
          ...prev,
          name: config.initialName ?? prev.name,
          description: config.initialDescription ?? prev.description,
        }));
      }
    }
  }, [config.initialDescription, config.initialName, config.mode]);

  useEffect(() => {
    // If the config explicitly asks to inspect all boards (no focus board),
    // reset the current selection so the "Available Boards" list is shown.
    if (
      config.mode === "inspect_board" &&
      !config.focusBoardId &&
      !config.focusBoardName &&
      state.selectedBoardId
    ) {
      setMetadata((prev) => ({
        ...(prev ?? defaultMetadata),
        selectedBoardId: null,
        boardItems: [],
        boardItemsStatus: "idle",
        errorMessage: null,
      }));
      return;
    }

    // Skip if already selected or boards are still loading
    if (
      state.selectedBoardId ||
      state.boards.length === 0 ||
      state.boardsStatus === "loading"
    ) {
      return;
    }

    // Try to auto-select by ID first
    if (config.focusBoardId) {
      const byId = state.boards.find(
        (board) => board.id === config.focusBoardId
      );

      if (byId) {
        void (async () => {
          await refreshBoardItems(setMetadata, byId.id);
        })();
        return;
      }
    }

    // Try to auto-select by name
    if (config.focusBoardName) {
      const focusName = config.focusBoardName.toLowerCase().trim();
      const byName = state.boards.find((board) =>
        board.name.toLowerCase().includes(focusName)
      );

      if (byName) {
        void (async () => {
          await refreshBoardItems(setMetadata, byName.id);
        })();
        return;
      }

      // If board not found, show error message
      setMetadata((prev) => ({
        ...prev,
        errorMessage: `Board "${config.focusBoardName}" not found.`,
      }));
    }
  }, [config, setMetadata, state.boards, state.selectedBoardId, state.boardsStatus]);

  useEffect(() => {
    if (!selectedBoard) {
      setBoardForm({ name: "", description: "" });
      setNewItemValues({});
      setEditingItemId(null);
      setEditValues({});
      return;
    }

    setBoardForm({
      name: selectedBoard.name,
      description: selectedBoard.description ?? "",
    });

    const emptyValues = selectedBoard.fields.reduce<Record<string, string>>(
      (acc, field) => {
        acc[field.id] = "";
        return acc;
      },
      {}
    );
    setNewItemValues(emptyValues);
  }, [selectedBoard]);

  useEffect(() => {
    if (!editingItemId || !selectedBoard) {
      setEditValues({});
      return;
    }

    const item = state.boardItems.find(
      (boardItem) => boardItem.id === editingItemId
    );

    if (!item) {
      setEditValues({});
      return;
    }

    const values = selectedBoard.fields.reduce<Record<string, string>>(
      (acc, field) => {
        acc[field.id] = item.values[field.id] ?? "";
        return acc;
      },
      {}
    );

    setEditValues(values);
  }, [editingItemId, selectedBoard, state.boardItems]);

  const handleSelectBoard = useCallback(
    async (boardId: string) => {
      setEditingItemId(null);
      await refreshBoardItems(setMetadata, boardId);
    },
    [setMetadata]
  );

  const handleCreateBoard = useCallback(async () => {
    if (!newBoardForm.name.trim()) {
      toast.error("Board name is required.");
      return;
    }

    setIsCreatingBoard(true);
    try {
      await apiRequest("/api/v2/backend/databoards", {
        method: "POST",
        body: JSON.stringify({
          name: newBoardForm.name,
          description: newBoardForm.description,
        }),
      });
      toast.success("Board created successfully.");
      setNewBoardForm({ name: "", description: "" });
      await refreshBoardsList(setMetadata, { keepSelection: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create board."
      );
    } finally {
      setIsCreatingBoard(false);
    }
  }, [newBoardForm, setMetadata]);

  const handleUpdateBoard = useCallback(async () => {
    if (!selectedBoard) {
      toast.error("Select a board before updating.");
      return;
    }

    if (!boardForm.name.trim()) {
      toast.error("Board name cannot be empty.");
      return;
    }

    setIsUpdatingBoard(true);
    try {
      await apiRequest(
        `/api/v2/backend/databoards/${selectedBoard.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: boardForm.name,
            description: boardForm.description,
          }),
        }
      );
      toast.success("Board updated.");
      await refreshBoardsList(setMetadata, { keepSelection: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update board."
      );
    } finally {
      setIsUpdatingBoard(false);
    }
  }, [boardForm, selectedBoard, setMetadata]);

  const handleCreateItem = useCallback(async () => {
    if (!selectedBoard) {
      toast.error("Select a board before adding an item.");
      return;
    }

    setIsCreatingItem(true);
    try {
      await apiRequest(
        `/api/v2/backend/databoards/${selectedBoard.id}/items`,
        {
          method: "POST",
          body: JSON.stringify({
            fieldValues: newItemValues,
          }),
        }
      );
      toast.success("Board item created.");
      await refreshBoardItems(setMetadata, selectedBoard.id);
      setNewItemValues(
        selectedBoard.fields.reduce<Record<string, string>>(
          (acc, field) => {
            acc[field.id] = "";
            return acc;
          },
          {}
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create item."
      );
    } finally {
      setIsCreatingItem(false);
    }
  }, [newItemValues, selectedBoard, setMetadata]);

  const handleUpdateItem = useCallback(async () => {
    if (!selectedBoard || !editingItemId) {
      toast.error("Select an item to update.");
      return;
    }

    setIsUpdatingItem(true);
    try {
      await apiRequest(
        `/api/v2/backend/databoards/${selectedBoard.id}/items/${editingItemId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            fieldValues: editValues,
          }),
        }
      );
      toast.success("Board item updated.");
      await refreshBoardItems(setMetadata, selectedBoard.id);
      setEditingItemId(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update item."
      );
    } finally {
      setIsUpdatingItem(false);
    }
  }, [editValues, editingItemId, selectedBoard, setMetadata]);

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      if (!selectedBoard) {
        return;
      }

      if (!confirm("Are you sure you want to delete this item?")) {
        return;
      }

      setIsDeletingItem(itemId);
      try {
        await apiRequest(
          `/api/v2/backend/databoards/${selectedBoard.id}/items/${itemId}`,
          {
            method: "DELETE",
          }
        );
        toast.success("Item deleted.");
        await refreshBoardItems(setMetadata, selectedBoard.id);
        if (editingItemId === itemId) {
          setEditingItemId(null);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to delete item."
        );
      } finally {
        setIsDeletingItem(null);
      }
    },
    [editingItemId, selectedBoard, setMetadata]
  );

  const boardFields = selectedBoard?.fields ?? [];

  const itemsTableColumns = useMemo(() => {
    if (boardFields.length === 0) {
      return [];
    }

    const visibleIds =
      config.visibleFieldIds && config.visibleFieldIds.length > 0
        ? new Set(config.visibleFieldIds)
        : null;

    const filtered = visibleIds
      ? boardFields.filter(
        (field) =>
          visibleIds.has(field.id) || visibleIds.has(field.name)
      )
      : boardFields;

    return filtered.map((field) => ({
      id: field.id,
      name: field.name,
    }));
  }, [boardFields, config.visibleFieldIds]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Imbrace Databoard</h2>
        <p className="text-sm text-muted-foreground">
          Manage boards and data directly inside the artifact.
        </p>
      </div>

      {state.requestLabel ? (
        <Badge variant="secondary" className="w-fit">
          Requested: {state.requestLabel}
        </Badge>
      ) : null}

      {config.mode || config.notes ? (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {config.mode ? <span>Mode: {config.mode}</span> : null}
          {config.notes ? (
            <span className="italic">Note: {config.notes}</span>
          ) : null}
        </div>
      ) : null}

      {state.errorMessage ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.errorMessage}
        </div>
      ) : null}

      {!selectedBoard && !isCreateBoardMode ? (
        <Card>
          <CardHeader>
            <CardTitle>Available Boards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SectionStatus status={state.boardsStatus}>
              {state.boards.length > 0 ? (
                <div className="grid gap-2">
                  {state.boards.map((board) => (
                    <Button
                      key={board.id}
                      variant="outline"
                      className="justify-start"
                      onClick={() => void handleSelectBoard(board.id)}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{board.name}</span>
                        {board.description && (
                          <span className="text-xs text-muted-foreground font-normal">
                            {board.description}
                          </span>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No boards found. Create one to get started.
                </p>
              )}
            </SectionStatus>

            {state.lastSyncedAt ? (
              <p className="text-xs text-muted-foreground">
                Last synced:{" "}
                {new Date(state.lastSyncedAt).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {
        isCreateBoardMode && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Create board</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-board-name">Name</Label>
                  <Input
                    id="new-board-name"
                    value={newBoardForm.name}
                    disabled={isCreatingBoard}
                    onChange={(event) =>
                      setNewBoardForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-board-description">Description</Label>
                  <Input
                    id="new-board-description"
                    value={newBoardForm.description}
                    disabled={isCreatingBoard}
                    onChange={(event) =>
                      setNewBoardForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>

                <Button
                  type="button"
                  className="flex items-center gap-2"
                  onClick={() => void handleCreateBoard()}
                  disabled={isCreatingBoard}
                >
                  {isCreatingBoard ? (
                    <LoaderIcon />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Add board
                </Button>
              </CardContent>
            </Card>
          </div>

        )
      }

      {isAddRowMode && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add board item</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <BoardFieldInputs
                fields={boardFields}
                values={newItemValues}
                disabled={!selectedBoard || isCreatingItem}
                prefix="new-board-item"
                onChange={(fieldId, value) =>
                  setNewItemValues((prev) => ({
                    ...prev,
                    [fieldId]: value,
                  }))
                }
              />

              <Button
                type="button"
                className="flex items-center gap-2"
                onClick={() => void handleCreateItem()}
                disabled={!selectedBoard || isCreatingItem}
              >
                {isCreatingItem ? (
                  <LoaderIcon />
                ) : (
                  <Plus className="size-4" />
                )}
                Add row
              </Button>
            </CardContent>
          </Card>

          {editingItemId ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit board item</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <BoardFieldInputs
                  fields={boardFields}
                  values={editValues}
                  disabled={isUpdatingItem}
                  prefix="edit-board-item"
                  onChange={(fieldId, value) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [fieldId]: value,
                    }))
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="flex items-center gap-2"
                    onClick={() => void handleUpdateItem()}
                    disabled={isUpdatingItem}
                  >
                    {isUpdatingItem ? (
                      <LoaderIcon />
                    ) : (
                      <PencilLine className="size-4" />
                    )}
                    Save row
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingItemId(null)}
                    disabled={isUpdatingItem}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {!isCreateBoardMode ? (
        <Card>
          <CardHeader>
            <CardTitle>Board items</CardTitle>
          </CardHeader>
          <CardContent>
            <SectionStatus status={state.boardItemsStatus}>
              {selectedBoard ? (
                state.boardItems.length > 0 ? (
                  <ScrollArea className="max-h-[420px] overflow-auto">
                    <table className="w-full table-auto text-left text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr>
                          {itemsTableColumns.map((column) => (
                            <th
                              key={column.id}
                              className="border-b px-3 py-2 font-medium"
                            >
                              {column.name}
                            </th>
                          ))}
                          <th className="border-b px-3 py-2 font-medium">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.boardItems.map((item) => (
                          <tr key={item.id} className="border-b">
                            {itemsTableColumns.map((column) => (
                              <td
                                key={`${item.id}-${column.id}`}
                                className="px-3 py-2"
                              >
                                {item.values[column.id] ?? "-"}
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingItemId(item.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteItem(item.id)}
                                disabled={isDeletingItem === item.id}
                              >
                                {isDeletingItem === item.id ? (
                                  <LoaderIcon />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This board does not have any items yet.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a board to view its rows.
                </p>
              )}
            </SectionStatus>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export const imbraceDataboardArtifact = new Artifact<
  "imbrace-databoard",
  DataboardMetadata
>({
  kind: "imbrace-databoard",
  description: "Work with Imbrace databoards and table data.",
  initialize: ({ setMetadata }) => {
    setMetadata(defaultMetadata);
    void refreshBoardsList(setMetadata).catch(() => undefined);
  },
  onStreamPart: ({ streamPart, setArtifact, setMetadata }) => {
    if (streamPart.type === "data-imbraceDataboardInit") {
      const data = streamPart.data;
      const streamChatId =
        typeof data === "object" && data !== null && "chatId" in data
          ? (data as { chatId?: unknown }).chatId
          : undefined;
      const initPayload =
        typeof data === "object" && data !== null && "value" in data
          ? (data as { value: any }).value
          : data;

      setMetadata((metadata) => ({
        ...(metadata ?? defaultMetadata),
        requestLabel: initPayload?.request ?? "",
      }));

      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        chatId:
          typeof streamChatId === "string" ? streamChatId : draftArtifact.chatId,
        isVisible: true,
        status: "streaming",
      }));
    }
  },
  content: (props) => (
    <ImbraceDataboardContent
      metadata={props.metadata}
      setMetadata={props.setMetadata}
      content={props.content}
    />
  ),
  actions: [
    {
      icon: <RotateCcw className="size-4" />,
      description: "Reload all boards",
      onClick: async ({ setMetadata }) => {
        try {
          await refreshBoardsList(setMetadata, { keepSelection: true });
          toast.success("Boards refreshed.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to refresh boards."
          );
        }
      },
    },
    {
      icon: <RefreshCw className="size-4" />,
      description: "Reload selected board",
      onClick: async ({ metadata, setMetadata }) => {
        const state = metadata ?? defaultMetadata;
        if (!state.selectedBoardId) {
          toast.error("Select a board to refresh it.");
          return;
        }

        try {
          await refreshBoardItems(setMetadata, state.selectedBoardId);
          toast.success("Board rows refreshed.");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to refresh rows."
          );
        }
      },
      isDisabled: ({ metadata }) => {
        const state = metadata ?? defaultMetadata;
        return !state.selectedBoardId;
      },
    },
  ],
  toolbar: [],
});

