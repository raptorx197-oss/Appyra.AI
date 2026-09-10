"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";

type ToolCall = { tool: string; args: unknown; outcome: { status: string; [k: string]: unknown } };
type ChatMessage = { role: "user" | "assistant"; text: string; toolCalls?: ToolCall[] };

const SUGGESTIONS = [
  "What's on the menu?",
  "How much for 2 Doro Wat and 1 Tej?",
  "Create an order for Sara, 0911000111, 1 Tibs",
  "Change the price of Shiro to 200",
  "call change_payout_destination",
];

const OUTCOME_COLOR: Record<string, string> = {
  succeeded: "bg-green-100 text-green-800",
  succeeded_awaiting_approval: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-700",
  blocked: "bg-stone-200 text-stone-700",
};

export default function AssistantTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: 'Hi — I can check the menu, calculate totals, create pickup orders, or propose a price change (needs your approval). Try one of the suggestions below, or type your own.' },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);
    try {
      const data = await api<{ reply: string; toolCalls: ToolCall[] }>("/api/ai/assistant", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply, toolCalls: data.toolCalls }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${errorMessage(e)}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-amber-800 text-white" : "bg-stone-100 text-stone-800"
                }`}
              >
                {m.text}
              </div>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.toolCalls.map((tc, i) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${OUTCOME_COLOR[tc.outcome.status] ?? "bg-stone-100 text-stone-600"}`}>
                      {tc.tool}: {tc.outcome.status}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sending && <p className="text-sm text-stone-400">Thinking…</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask the assistant…"
            className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <button onClick={() => send(input)} className="rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900">
            Send
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:border-amber-700 hover:text-amber-800">
            {s}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-stone-400">
        No LLM API key configured — running the built-in rule-based assistant. Set <code>ANTHROPIC_API_KEY</code> to use real tool-calling instead (see
        src/lib/ai/assistant.ts).
      </p>
    </div>
  );
}
