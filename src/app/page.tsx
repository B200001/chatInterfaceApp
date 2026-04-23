"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  followUps?: string[];
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function parseFollowUps(text: string): { content: string; followUps: string[] } {
  const marker = "__FOLLOW_UPS__:";
  const idx = text.indexOf(marker);
  if (idx === -1) return { content: text, followUps: [] };

  const before = text.slice(0, idx).trimEnd();
  const jsonPart = text.slice(idx + marker.length).trim();

  try {
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed)) {
      return { content: before, followUps: parsed as string[] };
    }
  } catch {
    // JSON not yet complete (still streaming)
  }
  return { content: text, followUps: [] };
}

/** Renders assistant message content as styled markdown */
function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3 mt-4 first:mt-0">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2 mt-4 first:mt-0">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 mt-3 first:mt-0">{children}</h3>;
        },
        strong({ children }) {
          return <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic text-gray-700 dark:text-gray-300">{children}</em>;
        },
        ul({ children }) {
          return <ul className="mb-3 last:mb-0 space-y-1.5 pl-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-3 last:mb-0 space-y-1.5 pl-1 list-decimal list-inside">{children}</ol>;
        },
        li({ children }) {
          return (
            <li className="flex items-start gap-2 text-[14px] leading-relaxed">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 flex-shrink-0" />
              <span className="flex-1">{children}</span>
            </li>
          );
        },
        hr() {
          return <hr className="my-3 border-gray-200 dark:border-gray-700" />;
        },
        code({ children, className }) {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-gray-100 dark:bg-gray-900 rounded-lg px-4 py-3 overflow-x-auto text-xs font-mono mb-3">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-600 dark:text-indigo-400">
              {children}
            </code>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-indigo-400 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
              {children}
            </blockquote>
          );
        },
        // ── TABLES ──────────────────────────────────────────────────────
        table({ children }) {
          return (
            <div className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <table className="min-w-full text-sm border-collapse">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-indigo-50 dark:bg-indigo-950/40">{children}</thead>;
        },
        tbody({ children }) {
          return <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{children}</tbody>;
        },
        tr({ children }) {
          return <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">{children}</tr>;
        },
        th({ children }) {
          return (
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide whitespace-nowrap">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("11");
  const [isEditingUserId, setIsEditingUserId] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setSessionId(generateSessionId()); }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: Message = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsStreaming(true);

      const assistantMessage: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, session_id: sessionId, user_id: userId }),
        });

        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          const { content, followUps } = parseFollowUps(accumulated);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content, followUps };
            return updated;
          });
        }

        // Final parse after stream ends
        const { content, followUps } = parseFollowUps(accumulated);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content, followUps };
          return updated;
        });
      } catch {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          };
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, sessionId, userId]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleFollowUpClick = (question: string) => sendMessage(question);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f8] dark:bg-[#0d0d0d]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#171717]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stack AI</h1>
        </div>
        <div className="flex items-center gap-3">
          {isEditingUserId ? (
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onBlur={() => setIsEditingUserId(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setIsEditingUserId(false); }}
              autoFocus
              className="text-xs font-mono px-2 py-1 rounded-md border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-[#0d0d0d] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
            />
          ) : (
            <button
              onClick={() => setIsEditingUserId(true)}
              className="flex items-center gap-1.5 text-xs font-mono text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              {userId}
            </button>
          )}
          <span className="text-xs text-gray-400 font-mono">{sessionId.slice(0, 16)}...</span>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-6">
              <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">How can I help you today?</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">Ask me anything about markets, investments, or financial insights.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 max-w-lg w-full">
              {["What is the market doing today?", "Top gaining stocks this week?", "Explain mutual fund SIP", "Compare Nifty 50 vs Sensex"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] text-sm text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.map((msg, i) => (
              <div key={i} className="mb-6">
                <div className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 text-[15px] ${
                      msg.role === "user"
                        ? "max-w-[80%] bg-indigo-600 text-white rounded-br-md whitespace-pre-wrap leading-relaxed"
                        : "flex-1 bg-white dark:bg-[#1e1e1e] text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-bl-md shadow-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <MarkdownMessage content={msg.content} />
                        {isStreaming && i === messages.length - 1 && (
                          <span className="inline-block w-2 h-5 ml-1 bg-indigo-500 animate-pulse rounded-sm align-text-bottom" />
                        )}
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Follow-up questions */}
                {msg.role === "assistant" &&
                  msg.followUps &&
                  msg.followUps.length > 0 &&
                  !(isStreaming && i === messages.length - 1) && (
                    <div className="mt-3 ml-12 flex flex-col gap-2">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                        Follow-up questions
                      </p>
                      {msg.followUps.map((q, qi) => (
                        <button
                          key={qi}
                          onClick={() => handleFollowUpClick(q)}
                          disabled={isStreaming}
                          className="group flex items-center gap-3 text-left px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] text-sm text-gray-700 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-semibold group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/60 transition-colors">
                            {qi + 1}
                          </span>
                          <span className="flex-1">{q}</span>
                          <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#171717] px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0d0d0d] px-4 py-3 pr-12 text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
              style={{ maxHeight: "200px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="h-12 w-12 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            {isStreaming ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-3">Session: {sessionId.slice(0, 20)}</p>
      </div>
    </div>
  );
}