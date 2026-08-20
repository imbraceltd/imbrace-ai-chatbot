"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Save } from "lucide-react";

interface CodeEditorProps {
  filePath: string;
  content: string;
  onSave: (filePath: string, content: string) => void;
}

export function CodeEditor({ filePath, content, onSave }: CodeEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync when file selection changes
  useEffect(() => {
    setLocalContent(content);
    setIsDirty(false);
  }, [filePath, content]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
    setIsDirty(e.target.value !== content);
  }, [content]);

  const handleSave = useCallback(() => {
    onSave(filePath, localContent);
    setIsDirty(false);
  }, [filePath, localContent, onSave]);

  // Ctrl+S / Cmd+S to save
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    // Tab inserts spaces instead of switching focus
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + "  " + value.substring(end);

      setLocalContent(newValue);
      setIsDirty(newValue !== content);

      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [handleSave, content]);

  return (
    <div className="h-full flex flex-col">
      {/* File header with save button */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">{filePath}</span>
          {isDirty && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
              modified
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            isDirty
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
          }`}
          title="Save (Ctrl+S)"
        >
          <Save className="h-3 w-3" />
          Save
        </button>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="flex-1 w-full p-4 text-sm font-mono bg-background text-foreground resize-none outline-none border-none leading-relaxed"
        style={{ tabSize: 2 }}
      />
    </div>
  );
}
