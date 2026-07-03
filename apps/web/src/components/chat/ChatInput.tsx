import { useState, useRef, useCallback } from "react";
import { Send, Mic, MicOff, Square } from "lucide-react";
import { useVoiceInput } from "../../hooks/useVoiceInput.js";

interface Props {
  onSend: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, onCancel, disabled, isStreaming }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback(
    (text: string) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    []
  );

  const { listening, supported, startListening, stopListening } = useVoiceInput(handleTranscript);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || disabled) return;
    onSend(text);
    setInput("");
    textareaRef.current?.focus();
  }, [input, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 p-3 jarvis-card rounded-lg">
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message Jarvis... (Enter to send, Shift+Enter for newline)"
        disabled={disabled}
        className="flex-1 bg-transparent resize-none text-sm text-jarvis-text placeholder-jarvis-muted outline-none leading-relaxed max-h-32 overflow-y-auto"
        style={{ minHeight: "1.5rem" }}
      />
      <button
        onClick={listening ? stopListening : startListening}
        disabled={!supported}
        title={supported ? (listening ? "Stop listening" : "Voice input") : "Voice not supported"}
        className={`p-1.5 rounded transition-colors ${
          listening ? "text-jarvis-cyan" : supported ? "text-jarvis-muted hover:text-jarvis-subtle" : "text-jarvis-border cursor-not-allowed"
        }`}
      >
        {listening ? <MicOff size={16} /> : <Mic size={16} />}
      </button>
      {isStreaming && onCancel ? (
        <button
          onClick={onCancel}
          title="Stop generation"
          className="p-1.5 rounded text-orange-400 hover:text-orange-300 transition-colors"
        >
          <Square size={16} />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="p-1.5 rounded text-jarvis-cyan hover:text-white disabled:text-jarvis-border disabled:cursor-not-allowed transition-colors"
        >
          <Send size={16} />
        </button>
      )}
    </div>
  );
}
