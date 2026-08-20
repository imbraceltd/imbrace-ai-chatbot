"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { MAX_FILE_SIZE, isValidFileType, sanitizeFileName } from "@/lib/files";
import { uploadFile as uploadFileApi } from "@/lib/imbrace/api";
import { IMBRACE_ORG_ID_KEY, IMBRACE_TOKEN_KEY } from "@/lib/imbrace/constants";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/client";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  PaperclipIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "./ui/button";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isProcessing,
  hasPendingApproval = false,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedModelId,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isProcessing?: boolean;
  /** Derived from messages by the parent — true when the last assistant
   * message has a tool part awaiting Approve/Deny. Blocks send. */
  hasPendingApproval?: boolean;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedModelId: string;
}) {
  const { t } = useTranslation("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  const submitForm = useCallback(async () => {
    if (!input.trim()) return;

    const inputSnapshot = input;
    const attachmentsSnapshot = attachments;

    try {
      // Clear the UI immediately on submit (optimistic), so the user can keep typing
      // without waiting for the network response.
      setAttachments([]);
      setLocalStorageInput("");
      resetHeight();
      setInput("");

      if (width && width > 768) {
        textareaRef.current?.focus();
      }

      // Reason: Update URL immediately so the chat ID is in the URL before streaming starts.
      // If the user reloads during processing, they'll land on /chat/{id} instead of /
      // and can recover the chat session.
      window.history.replaceState({}, "", `/chat/${chatId}`);

      await sendMessage({
        role: "user",
        parts: [
          ...attachmentsSnapshot.map((attachment) => ({
            type: "file" as const,
            url: attachment.url,
            name: attachment.name,
            mediaType: attachment.contentType,
          })),
          {
            type: "text",
            text: inputSnapshot,
          },
        ],
      });
    } catch {
      // Restore only if the user hasn't started typing/selecting a new file yet.
      setInput((current) => (current.trim().length === 0 ? inputSnapshot : current));
      setLocalStorageInput((current) =>
        current.trim().length === 0 ? inputSnapshot : current
      );
      setAttachments((current) =>
        current.length === 0 ? attachmentsSnapshot : current
      );
    }
  }, [
    input,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("File.tooLarge"));
      return;
    }

    // Validate file type
    if (!isValidFileType(file.type)) {
      toast.error(
        t("File.unsupported")
      );
      return;
    }

    const safeName = sanitizeFileName(file.name);
    const safeFile =
      safeName === file.name
        ? file
        : new File([file], safeName, {
            type: file.type,
            lastModified: file.lastModified,
          });

    const formData = new FormData();
    formData.append("file", safeFile);

    try {
      // Get Imbrace token from localStorage
      const imbraceToken =
        typeof window !== "undefined"
          ? localStorage.getItem(IMBRACE_TOKEN_KEY)
          : null;

      const imbraceOrgId =
        typeof window !== "undefined"
          ? localStorage.getItem(IMBRACE_ORG_ID_KEY)
          : null;

      const headers: HeadersInit = {};
      if (imbraceToken) {
        headers["x-access-token"] = imbraceToken;
      }
      if (imbraceOrgId) {
        headers["x-organization-id"] = imbraceOrgId;
      }

      const response = await fetch(`/appgateway${uploadFileApi.api}`, {
        method: uploadFileApi.method,
        headers,
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        // Reason: data-board's upload returns an array of uploaded items, each
        // carrying a permanent public S3 `url` (no expiry) — use it directly so
        // the attachment stays openable in chat indefinitely.
        const first = Array.isArray(data) ? data[0] : data;
        const url =
          typeof first === "object" && first !== null && "url" in first
            ? (first as { url?: unknown }).url
            : undefined;

        if (typeof url !== "string" || url.trim().length === 0) {
          const itemError =
            typeof first === "object" && first !== null && "error" in first
              ? (first as { error?: unknown }).error
              : undefined;
          toast.error(
            typeof itemError === "string" && itemError.trim().length > 0
              ? itemError
              : "Upload succeeded but no URL was returned."
          );
          return;
        }

        return {
          url,
          name: safeName,
          contentType: file.type,
        };
      }

      const errorSource = Array.isArray(data) ? data[0] : data;
      const errorMessage =
        typeof errorSource === "object" &&
        errorSource !== null &&
        "error" in errorSource
          ? (errorSource as { error?: unknown }).error
          : undefined;
      toast.error(typeof errorMessage === "string" ? errorMessage : "Upload failed");
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      if (files.length === 0) return;

      setUploadQueue(
        files.map((file, index) =>
          file.name.trim().length > 0 ? file.name : `Attachment ${index + 1}`
        )
      );

      try {
        const uploadedAttachments = await Promise.all(files.map(uploadFile));
        const successfulUploads = uploadedAttachments.filter(
          (attachment): attachment is Attachment => Boolean(attachment)
        );

        if (successfulUploads.length > 0) {
          setAttachments((current) => [...current, ...successfulUploads]);
        }
      } catch {
        // keep silent; toast is shown inside uploadFile
      } finally {
        setUploadQueue([]);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [setAttachments, uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      // Filter for supported file types (images only for paste)
      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith("image/")
      );

      if (imageItems.length === 0) return;

      // Prevent default paste behavior for images
      event.preventDefault();

      const files = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;

      setUploadQueue(
        files.map((file, index) =>
          file.name.trim().length > 0 ? file.name : `Pasted image ${index + 1}`
        )
      );

      try {
        const uploadedAttachments = await Promise.all(files.map(uploadFile));
        const successfulUploads = uploadedAttachments.filter(
          (attachment): attachment is Attachment => Boolean(attachment)
        );

        if (successfulUploads.length > 0) {
          setAttachments((current) => [...current, ...successfulUploads]);
        }
      } catch {
        toast.error("Failed to upload pasted images");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  // Add paste event listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <input
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/csv"
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          // Allow re-submit when the previous request failed (status "error").
          if (status === "streaming" || isProcessing) {
            toast.error("Please wait for the model to finish its response!");
          } else if (hasPendingApproval) {
            toast.error(
              "Please approve or deny the pending tool call before sending another message.",
            );
          } else {
            void submitForm();
          }
        }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <PromptInputTextarea
          autoFocus
          className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
          data-testid="multimodal-input"
          disableAutoResize={true}
          maxHeight={200}
          minHeight={44}
          onChange={handleInput}
          placeholder={t("Chat.inputPlaceholder")}
          ref={textareaRef}
          rows={1}
          value={input}
        />
        <PromptInputToolbar className="!border-top-0 border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <AttachmentsButton
              fileInputRef={fileInputRef}
              isProcessing={isProcessing || hasPendingApproval}
              isUploading={uploadQueue.length > 0}
              selectedModelId={selectedModelId}
              status={status}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              disabled={
                !input.trim() ||
                uploadQueue.length > 0 ||
                isProcessing ||
                hasPendingApproval
              }
              status={status}
              data-testid="send-button"
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.isProcessing !== nextProps.isProcessing) {
      return false;
    }
    if (prevProps.hasPendingApproval !== nextProps.hasPendingApproval) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
  isProcessing,
  isUploading,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
  isProcessing?: boolean;
  isUploading: boolean;
}) {
  const isReasoningModel = selectedModelId === "chat-model-reasoning";
  const isDisabled =
    status === "submitted" || status === "streaming" || isReasoningModel || isUploading || isProcessing;

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={isDisabled}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      title={isUploading ? "Uploading..." : "Attach file"}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
