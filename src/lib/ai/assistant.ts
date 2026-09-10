import { Actor, DispatchResult, MenuItemView, dispatchTool, TOOL_REGISTRY } from "./core";

// ============================================================================
// ORCHESTRATION — isolated behind this module so a real LLM provider can be
// swapped in without touching the tool registry or dispatcher (per API.md
// section on POST /api/ai/assistant, and the original handoff's section 31:
// "don't hard-code a single provider into the tool-calling loop").
//
// Two providers:
//   - AnthropicProvider: real tool-calling via the Messages API. Used when
//     ANTHROPIC_API_KEY is set.
//   - LocalRuleBasedProvider: zero-dependency fallback so the pilot is fully
//     runnable with no API key/network — pattern-matches a handful of
//     staff phrasings onto the same 4-tool registry. This is what runs by
//     default in this prototype.
// ============================================================================

export type ChatToolCall = { tool: string; args: unknown; outcome: DispatchResult };
export type AssistantReply = { reply: string; toolCalls: ChatToolCall[] };

interface AssistantProvider {
  respond(message: string, actor: Actor): Promise<AssistantReply>;
}

function money(n: number): string {
  return `${n.toFixed(2)} ETB`;
}

function extractItemMentions(message: string, menu: MenuItemView[]): Array<{ item: MenuItemView; quantity: number }> {
  const lower = message.toLowerCase();
  const found: Array<{ item: MenuItemView; quantity: number }> = [];
  const sorted = [...menu].sort((a, b) => b.name.length - a.name.length);
  for (const item of sorted) {
    const name = item.name.toLowerCase();
    const idx = lower.indexOf(name);
    if (idx === -1) continue;
    if (found.some((f) => f.item.id === item.id)) continue;
    const before = lower.slice(Math.max(0, idx - 12), idx);
    const m = before.match(/(\d+)\s*x?\s*$/);
    const quantity = m ? parseInt(m[1], 10) : 1;
    found.push({ item, quantity });
  }
  return found;
}

function extractPrice(message: string): number | null {
  const to = message.match(/to\s+(\d+(?:\.\d+)?)/i);
  if (to) return parseFloat(to[1]);
  const nums = message.match(/(\d+(?:\.\d+)?)/g);
  if (nums && nums.length > 0) return parseFloat(nums[nums.length - 1]);
  return null;
}

function extractCustomer(message: string): { name: string | null; phone: string | null } {
  const phoneMatch = message.match(/(\+?\d[\d\-\s]{6,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, "") : null;
  const nameMatch = message.match(/for\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?)/);
  const name = nameMatch ? nameMatch[1].trim() : null;
  return { name, phone };
}

class LocalRuleBasedProvider implements AssistantProvider {
  async respond(message: string, actor: Actor): Promise<AssistantReply> {
    const lower = message.toLowerCase();
    const toolCalls: ChatToolCall[] = [];

    // Deliberately dispatch through the exact same string-keyed lookup a
    // model's tool-call would use — this is what makes the prompt-injection
    // test meaningful even without a real model in the loop.
    const call = (tool: string, args: unknown) => {
      const outcome = dispatchTool(tool, args, actor);
      toolCalls.push({ tool, args, outcome });
      return outcome;
    };

    // Escape hatch: let a demo/test directly name an unregistered tool,
    // e.g. "call change_payout_destination" or "run tool xyz".
    const rawToolMatch = message.match(/\b(?:call|run|invoke)\s+(?:tool\s+)?["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/i);
    if (rawToolMatch && !TOOL_REGISTRY[rawToolMatch[1]] && !["check_menu", "calculate_order_total", "create_order", "propose_price_change"].includes(rawToolMatch[1])) {
      const outcome = call(rawToolMatch[1], {});
      return { reply: outcome.status === "blocked" ? outcome.message : "That didn't work.", toolCalls };
    }

    if (/menu|what.*(have|serve|offer)|show me/.test(lower) && !/price|propose|change/.test(lower)) {
      const outcome = call("check_menu", {});
      if (outcome.status === "succeeded") {
        const items = outcome.result as MenuItemView[];
        const lines = items.map((i) => `- ${i.name} — ${money(i.price)}${i.isAvailable ? "" : " (unavailable)"}`);
        return { reply: `Here's the current menu:\n${lines.join("\n")}`, toolCalls };
      }
      return { reply: "I couldn't load the menu.", toolCalls };
    }

    if (/price|propose|change.*price|update.*price/.test(lower)) {
      const menuOutcome = call("check_menu", {});
      const menu = menuOutcome.status === "succeeded" ? (menuOutcome.result as MenuItemView[]) : [];
      const mentions = extractItemMentions(message, menu);
      const price = extractPrice(message);
      if (mentions.length === 0 || price === null) {
        return { reply: 'I can propose a price change, but I need an item and a new price — try "change the price of Doro Wat to 275".', toolCalls };
      }
      const outcome = call("propose_price_change", { menuItemId: mentions[0].item.id, newPrice: price });
      if (outcome.status === "succeeded_awaiting_approval") {
        const p = outcome.proposal;
        return {
          reply: `I've proposed changing "${mentions[0].item.name}" from ${money(p.payload.previousPrice)} to ${money(p.payload.newPrice)}. This is not applied yet — it's waiting in Proposals for a staff member to approve or reject.`,
          toolCalls,
        };
      }
      if (outcome.status === "failed") return { reply: `I couldn't propose that: ${outcome.message}`, toolCalls };
      return { reply: "Something unexpected happened proposing that change.", toolCalls };
    }

    if (/order|checkout|place/.test(lower)) {
      const menuOutcome = call("check_menu", {});
      const menu = menuOutcome.status === "succeeded" ? (menuOutcome.result as MenuItemView[]) : [];
      const mentions = extractItemMentions(message, menu);
      const { name, phone } = extractCustomer(message);
      if (mentions.length === 0) {
        return { reply: 'Tell me what to order and for whom — try "create an order for Sara, 0911000111, 2 Doro Wat".', toolCalls };
      }
      if (!name || !phone) {
        const totalOutcome = call("calculate_order_total", { items: mentions.map((m) => ({ menuItemId: m.item.id, quantity: m.quantity })) });
        const total = totalOutcome.status === "succeeded" ? (totalOutcome.result as { total: number }).total : null;
        return {
          reply: `That would come to ${total !== null ? money(total) : "an amount I couldn't calculate"}. I still need a customer name and phone number to actually create the order.`,
          toolCalls,
        };
      }
      const outcome = call("create_order", {
        items: mentions.map((m) => ({ menuItemId: m.item.id, quantity: m.quantity })),
        customerName: name,
        customerPhone: phone,
        idempotencyKey: `assistant-${actor.profileId}-${Date.now()}`,
      });
      if (outcome.status === "succeeded") {
        const order = outcome.result as { id: string; totalAmount: number };
        return { reply: `Order created for ${name} — total ${money(order.totalAmount)}. Order ID ${order.id}.`, toolCalls };
      }
      if (outcome.status === "failed") return { reply: `Couldn't create the order: ${outcome.message}`, toolCalls };
      return { reply: "Something unexpected happened creating that order.", toolCalls };
    }

    if (/total|cost|how much/.test(lower)) {
      const menuOutcome = call("check_menu", {});
      const menu = menuOutcome.status === "succeeded" ? (menuOutcome.result as MenuItemView[]) : [];
      const mentions = extractItemMentions(message, menu);
      if (mentions.length === 0) {
        return { reply: 'Tell me which items — try "how much for 2 Doro Wat and 1 Tej".', toolCalls };
      }
      const outcome = call("calculate_order_total", { items: mentions.map((m) => ({ menuItemId: m.item.id, quantity: m.quantity })) });
      if (outcome.status === "succeeded") {
        const r = outcome.result as { total: number; lines: Array<{ name: string; quantity: number; lineTotal: number }> };
        const lines = r.lines.map((l) => `- ${l.quantity}x ${l.name} = ${money(l.lineTotal)}`);
        return { reply: `${lines.join("\n")}\nTotal: ${money(r.total)}`, toolCalls };
      }
      if (outcome.status === "failed") return { reply: `Couldn't calculate that: ${outcome.message}`, toolCalls };
      return { reply: "Something unexpected happened.", toolCalls };
    }

    return {
      reply:
        'I can check the menu, calculate an order total, create an order, or propose a price change (which needs staff approval). Try: "what\'s on the menu", "how much for 2 Doro Wat", "create an order for Sara, 0911000111, 1 Tibs", or "change the price of Shiro to 200".',
      toolCalls,
    };
  }
}

// ----------------------------------------------------------------------------
// Real provider — used automatically when ANTHROPIC_API_KEY is set. Exposes
// the same 4 tools to the model via the Messages API's tool-calling and runs
// every model-requested call through the identical dispatchTool() used
// above, so the authorization/logging guarantees don't change based on
// which provider is orchestrating.
// ----------------------------------------------------------------------------

const ANTHROPIC_TOOLS = [
  {
    name: "check_menu",
    description: "Returns the caller's own restaurant's full menu (items, prices, availability).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "calculate_order_total",
    description: "Computes a total price for a set of menu items and quantities, using live authoritative prices.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { menuItemId: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
            required: ["menuItemId", "quantity"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "create_order",
    description: "Creates a pending order for pickup. Price is always recomputed server-side. Requires a unique idempotencyKey.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { menuItemId: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
            required: ["menuItemId", "quantity"],
          },
        },
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        notes: { type: "string" },
        idempotencyKey: { type: "string" },
      },
      required: ["items", "customerName", "customerPhone", "idempotencyKey"],
    },
  },
  {
    name: "propose_price_change",
    description: "Proposes a new price for a menu item. Does NOT apply it — creates a proposal a human staff member must separately approve.",
    input_schema: {
      type: "object",
      properties: { menuItemId: { type: "string" }, newPrice: { type: "number", minimum: 0 } },
      required: ["menuItemId", "newPrice"],
    },
  },
];

// Minimal structural types for the Messages API shapes this provider actually
// reads — enough to keep the response handling type-checked without pulling in
// the full SDK for a prototype.
type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };
type AnthropicToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentBlock[] | AnthropicToolResultBlock[] };
type AnthropicResponse = { content?: AnthropicContentBlock[] };

const isTextBlock = (b: AnthropicContentBlock): b is AnthropicTextBlock => b.type === "text";
const isToolUseBlock = (b: AnthropicContentBlock): b is AnthropicToolUseBlock => b.type === "tool_use";

class AnthropicProvider implements AssistantProvider {
  async respond(message: string, actor: Actor): Promise<AssistantReply> {
    const toolCalls: ChatToolCall[] = [];
    const messages: AnthropicMessage[] = [{ role: "user", content: message }];

    for (let turn = 0; turn < 4; turn++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system:
            "You are a restaurant staff assistant for Appyra. You can check the menu, calculate order totals, create pickup orders, and propose (never directly apply) price changes. Be concise.",
          tools: ANTHROPIC_TOOLS,
          messages,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { reply: `AI provider error: ${res.status} ${text}`, toolCalls };
      }

      const data = (await res.json()) as AnthropicResponse;
      const blocks = data.content ?? [];
      const toolUseBlocks = blocks.filter(isToolUseBlock);
      const textBlocks = blocks.filter(isTextBlock).map((b) => b.text);

      if (toolUseBlocks.length === 0) {
        return { reply: textBlocks.join("\n") || "(no response)", toolCalls };
      }

      messages.push({ role: "assistant", content: blocks });
      const toolResults: AnthropicToolResultBlock[] = [];
      for (const block of toolUseBlocks) {
        const outcome = dispatchTool(block.name, block.input, actor);
        toolCalls.push({ tool: block.name, args: block.input, outcome });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(outcome) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return { reply: "Reached the maximum number of tool-call turns for this request.", toolCalls };
  }
}

export async function runAssistant(message: string, actor: Actor): Promise<AssistantReply> {
  const provider: AssistantProvider = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : new LocalRuleBasedProvider();
  return provider.respond(message, actor);
}
