import { getDb, uuid, nowIso } from "../db.ts";

// ============================================================================
// AI PILOT — TOOL REGISTRY + DISPATCHER
// ============================================================================
// Reference implementation for docs/AI.md's "AI can act, humans authorize
// consequences" principle. Ported into app/api/ai/assistant/route.ts and
// app/api/ai/proposals/[id]/approve/route.ts — this module is the single
// source of truth for the tool contracts, authorization levels, and the
// approval boundary; the API routes are thin wrappers around it.
//
// No separate AI identity: every call runs inside an Actor that already
// carries a real staff profileId + restaurantId (see src/lib/auth.ts). There
// is no ai_agents credential to leak or scope separately.
// ============================================================================

export type AuthorizationLevel = "auto" | "approval_required" | "human_only" | "never_exposed";

export type Actor =
  | { type: "ai"; profileId: string; restaurantId: string }
  | { type: "human_staff"; profileId: string; restaurantId: string };

export class ToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class AuthorizationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ----------------------------------------------------------------------------
// check_menu — auto, read-only
// ----------------------------------------------------------------------------

export type MenuItemView = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
};

function checkMenu(actor: Actor): MenuItemView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `select mi.id, mi.category_id as categoryId, mc.name as categoryName, mi.name, mi.description,
              mi.price, mi.is_available as isAvailable
       from menu_items mi
       join menu_categories mc on mc.id = mi.category_id
       join menus m on m.id = mc.menu_id
       where m.restaurant_id = ?
       order by mc.display_order, mi.display_order`
    )
    .all(actor.restaurantId) as Array<{
      id: string; categoryId: string; categoryName: string; name: string;
      description: string | null; price: number; isAvailable: number;
    }>;

  return rows.map((r) => ({ ...r, isAvailable: !!r.isAvailable }));
}

// ----------------------------------------------------------------------------
// calculate_order_total — auto, read-only. Never trusts a client-asserted
// price; always looks items up fresh, scoped strictly to actor.restaurantId
// (never to a restaurant_id passed in args — there is no such argument).
// ----------------------------------------------------------------------------

export type OrderLineArg = { menuItemId: string; quantity: number };

export type OrderTotalResult = {
  total: number;
  lines: Array<{ menuItemId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }>;
};

function lookupAuthoritativeLines(restaurantId: string, items: OrderLineArg[]) {
  if (!items || items.length === 0) {
    throw new ToolError("empty_items", "At least one item is required.");
  }
  const db = getDb();
  const stmt = db.prepare(
    `select mi.id, mi.name, mi.price, mi.is_available as isAvailable
     from menu_items mi
     join menu_categories mc on mc.id = mi.category_id
     join menus m on m.id = mc.menu_id
     where mi.id = ? and m.restaurant_id = ?`
  );

  const lines: OrderTotalResult["lines"] = [];
  for (const item of items) {
    if (!item.menuItemId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ToolError("invalid_item", "Each item needs a valid menuItemId and a positive integer quantity.");
    }
    const row = stmt.get(item.menuItemId, restaurantId) as
      | { id: string; name: string; price: number; isAvailable: number }
      | undefined;
    if (!row) {
      throw new ToolError("item_not_found", `Menu item ${item.menuItemId} does not belong to this restaurant.`);
    }
    if (!row.isAvailable) {
      throw new ToolError("item_unavailable", `"${row.name}" is currently unavailable.`);
    }
    lines.push({ menuItemId: row.id, name: row.name, unitPrice: row.price, quantity: item.quantity, lineTotal: row.price * item.quantity });
  }
  return lines;
}

function calculateOrderTotal(actor: Actor, args: { items: OrderLineArg[] }): OrderTotalResult {
  const lines = lookupAuthoritativeLines(actor.restaurantId, args.items);
  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { total: Math.round(total * 100) / 100, lines };
}

// ----------------------------------------------------------------------------
// create_order — auto (to call). Independently recomputes price from
// authoritative data; a clientAssertedTotal is accepted only to prove it's
// ignored. Idempotent via a required idempotencyKey.
// ----------------------------------------------------------------------------

export type CreateOrderArgs = {
  items: OrderLineArg[];
  customerName: string;
  customerPhone: string;
  notes?: string | null;
  idempotencyKey: string;
  clientAssertedTotal?: number; // deliberately never read for pricing — see test suite
};

export type OrderView = {
  id: string;
  restaurantId: string;
  status: string;
  totalAmount: number;
  items: Array<{ itemName: string; itemPrice: number; quantity: number }>;
  createdAt: string;
};

function createOrder(actor: Actor, args: CreateOrderArgs): OrderView {
  if (!args.idempotencyKey) {
    throw new ToolError("idempotency_key_required", "create_order requires an idempotencyKey.");
  }
  if (!args.customerName || !args.customerPhone) {
    throw new ToolError("missing_customer_info", "customerName and customerPhone are required.");
  }

  const db = getDb();

  const existingKey = db
    .prepare(`select order_id as orderId from ai_idempotency_keys where restaurant_id = ? and idempotency_key = ?`)
    .get(actor.restaurantId, args.idempotencyKey) as { orderId: string } | undefined;

  if (existingKey) {
    return getOrderView(existingKey.orderId);
  }

  const restaurant = db
    .prepare(`select is_active as isActive from restaurants where id = ?`)
    .get(actor.restaurantId) as { isActive: number } | undefined;
  if (!restaurant || !restaurant.isActive) {
    throw new ToolError("restaurant_not_found", "Restaurant not found or inactive.");
  }

  // Authoritative recomputation — args.clientAssertedTotal is never read here.
  const lines = lookupAuthoritativeLines(actor.restaurantId, args.items);
  const total = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;

  const now = nowIso();
  const orderId = uuid();
  db.prepare(
    `insert into orders (id, restaurant_id, customer_profile_id, customer_name, customer_phone, status, total_amount, notes, created_at, updated_at)
     values (?, ?, null, ?, ?, 'pending', ?, ?, ?, ?)`
  ).run(orderId, actor.restaurantId, args.customerName, args.customerPhone, total, args.notes ?? null, now, now);

  for (const line of lines) {
    db.prepare(
      `insert into order_items (id, order_id, menu_item_id, item_name, item_price, quantity, created_at) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), orderId, line.menuItemId, line.name, line.unitPrice, line.quantity, now);
  }

  db.prepare(
    `insert into ai_idempotency_keys (restaurant_id, idempotency_key, order_id, created_at) values (?, ?, ?, ?)`
  ).run(actor.restaurantId, args.idempotencyKey, orderId, now);

  return getOrderView(orderId);
}

function getOrderView(orderId: string): OrderView {
  const db = getDb();
  const order = db
    .prepare(`select id, restaurant_id as restaurantId, status, total_amount as totalAmount, created_at as createdAt from orders where id = ?`)
    .get(orderId) as { id: string; restaurantId: string; status: string; totalAmount: number; createdAt: string };
  const items = db
    .prepare(`select item_name as itemName, item_price as itemPrice, quantity from order_items where order_id = ?`)
    .all(orderId) as Array<{ itemName: string; itemPrice: number; quantity: number }>;
  return { ...order, items };
}

// ----------------------------------------------------------------------------
// propose_price_change — approval_required. Creates a proposal, never
// touches menu_items directly. Only approveProposal() (below), which
// structurally requires a human_staff actor, can apply it.
// ----------------------------------------------------------------------------

export type ProposePriceChangeArgs = { menuItemId: string; newPrice: number };

export type Proposal = {
  id: string;
  restaurantId: string;
  initiatedByProfileId: string;
  capability: string;
  payload: { menuItemId: string; newPrice: number; previousPrice: number };
  status: "awaiting_approval" | "approved" | "rejected";
  approvedByProfileId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type ProposalRow = {
  id: string;
  restaurantId: string;
  initiatedByProfileId: string;
  capability: string;
  /** stored as a JSON string in SQLite; parsed into Proposal["payload"] below */
  payload: string;
  status: Proposal["status"];
  approvedByProfileId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

function rowToProposal(raw: unknown): Proposal {
  // node:sqlite returns Record<string, SQLOutputValue>; the column list in
  // every query feeding this mapper is fixed, so the shape is asserted once
  // here rather than at each call site.
  const row = raw as ProposalRow;
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    initiatedByProfileId: row.initiatedByProfileId,
    capability: row.capability,
    payload: JSON.parse(row.payload),
    status: row.status,
    approvedByProfileId: row.approvedByProfileId,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  };
}

function proposePriceChange(actor: Actor, args: ProposePriceChangeArgs): Proposal {
  if (!args.menuItemId || typeof args.newPrice !== "number" || args.newPrice < 0) {
    throw new ToolError("invalid_args", "menuItemId and a non-negative newPrice are required.");
  }
  const db = getDb();
  const item = db
    .prepare(
      `select mi.id, mi.price from menu_items mi
       join menu_categories mc on mc.id = mi.category_id
       join menus m on m.id = mc.menu_id
       where mi.id = ? and m.restaurant_id = ?`
    )
    .get(args.menuItemId, actor.restaurantId) as { id: string; price: number } | undefined;

  if (!item) {
    throw new ToolError("item_not_found", "Menu item does not belong to this restaurant.");
  }

  const now = nowIso();
  const id = uuid();
  const payload = { menuItemId: args.menuItemId, newPrice: args.newPrice, previousPrice: item.price };
  db.prepare(
    `insert into ai_action_proposals (id, restaurant_id, initiated_by_profile_id, capability, payload, status, approved_by_profile_id, resolved_at, created_at, updated_at)
     values (?, ?, ?, 'propose_price_change', ?, 'awaiting_approval', null, null, ?, ?)`
  ).run(id, actor.restaurantId, actor.profileId, JSON.stringify(payload), now, now);

  const row = db
    .prepare(
      `select id, restaurant_id as restaurantId, initiated_by_profile_id as initiatedByProfileId, capability, payload,
              status, approved_by_profile_id as approvedByProfileId, resolved_at as resolvedAt, created_at as createdAt
       from ai_action_proposals where id = ?`
    )
    .get(id);
  return rowToProposal(row);
}

// ----------------------------------------------------------------------------
// TOOL REGISTRY — 4 tools. Nothing else exists. In particular there is no
// change_payout_destination tool, or any tool for any other high-risk
// capability — "there is no tool capable of performing the action" is the
// guarantee, not a permission check that could have a bug in it.
// ----------------------------------------------------------------------------

// Args arrive from the model as untrusted JSON, so the registry types them as
// `unknown` and each entry casts at its own boundary — the tool function it
// forwards to is what actually validates (and throws ToolError on bad input).
type ToolDef =
  | { kind: "auto"; authorizationLevel: "auto"; run: (actor: Actor, args: unknown) => unknown }
  | { kind: "approval_required"; authorizationLevel: "approval_required"; propose: (actor: Actor, args: unknown) => Proposal };

export const TOOL_REGISTRY: Record<string, ToolDef> = {
  check_menu: { kind: "auto", authorizationLevel: "auto", run: (actor) => checkMenu(actor) },
  calculate_order_total: { kind: "auto", authorizationLevel: "auto", run: (actor, args) => calculateOrderTotal(actor, args as { items: OrderLineArg[] }) },
  create_order: { kind: "auto", authorizationLevel: "auto", run: (actor, args) => createOrder(actor, args as CreateOrderArgs) },
  propose_price_change: {
    kind: "approval_required",
    authorizationLevel: "approval_required",
    propose: (actor, args) => proposePriceChange(actor, args as ProposePriceChangeArgs),
  },
};

// ----------------------------------------------------------------------------
// DISPATCH — every call, success or failure or blocked, is written to
// ai_action_log. An unknown tool name (including anything a prompt-injection
// attempt might try to smuggle in) resolves to "no such tool" and nothing
// executes — there's no dynamic dispatch by string beyond this registry
// lookup, so there's nothing to inject into.
// ----------------------------------------------------------------------------

export type DispatchResult =
  | { status: "succeeded"; result: unknown }
  | { status: "succeeded_awaiting_approval"; proposal: Proposal }
  | { status: "failed"; code: string; message: string }
  | { status: "blocked"; message: string };

function logAction(actor: Actor, toolName: string, args: unknown, level: AuthorizationLevel, status: "succeeded" | "failed" | "blocked", summary: string) {
  const db = getDb();
  db.prepare(
    `insert into ai_action_log (id, restaurant_id, initiated_by_profile_id, tool_name, requested_args, authorization_level, execution_status, result_summary, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), actor.restaurantId, actor.profileId, toolName, JSON.stringify(args ?? null), level, status, summary, nowIso());
}

export function dispatchTool(toolName: string, args: unknown, actor: Actor): DispatchResult {
  const tool = TOOL_REGISTRY[toolName];

  if (!tool) {
    logAction(actor, toolName, args, "never_exposed", "blocked", `No such tool: "${toolName}".`);
    return { status: "blocked", message: `No such tool: "${toolName}". This assistant cannot perform that action.` };
  }

  try {
    if (tool.kind === "auto") {
      const result = tool.run(actor, args);
      logAction(actor, toolName, args, tool.authorizationLevel, "succeeded", `${toolName} executed.`);
      return { status: "succeeded", result };
    } else {
      const proposal = tool.propose(actor, args);
      logAction(actor, toolName, args, tool.authorizationLevel, "succeeded", `Proposal ${proposal.id} created, awaiting staff approval. No change applied yet.`);
      return { status: "succeeded_awaiting_approval", proposal };
    }
  } catch (err) {
    const code = err instanceof ToolError ? err.code : "unexpected_error";
    const message = err instanceof Error ? err.message : "Unexpected error.";
    logAction(actor, toolName, args, tool.authorizationLevel, "failed", `${code}: ${message}`);
    return { status: "failed", code, message };
  }
}

// ----------------------------------------------------------------------------
// APPROVAL — the only path by which a proposal's underlying change is ever
// applied. Structurally requires a human_staff actor: an AI actor is
// rejected by type, not by a runtime flag a bug could bypass.
// ----------------------------------------------------------------------------

export function approveProposal(proposalId: string, actor: Actor): Proposal {
  if (actor.type !== "human_staff") {
    throw new AuthorizationError("ai_cannot_approve", "An AI actor cannot approve its own proposal. Only human_staff may approve.");
  }
  const db = getDb();
  const row = db
    .prepare(
      `select id, restaurant_id as restaurantId, initiated_by_profile_id as initiatedByProfileId, capability, payload,
              status, approved_by_profile_id as approvedByProfileId, resolved_at as resolvedAt, created_at as createdAt
       from ai_action_proposals where id = ?`
    )
    .get(proposalId);

  if (!row) throw new AuthorizationError("not_found", "Proposal not found.");
  const proposal = rowToProposal(row);

  if (proposal.restaurantId !== actor.restaurantId) {
    throw new AuthorizationError("forbidden", "This proposal does not belong to your restaurant.");
  }
  if (proposal.status !== "awaiting_approval") {
    throw new AuthorizationError("already_resolved", `Proposal is already ${proposal.status}.`);
  }

  const now = nowIso();
  // Apply the change and resolve the proposal in one synchronous unit —
  // node:sqlite executes both statements before any other connection can
  // interleave (single-writer, same as the transactional guarantee the
  // real Postgres route would use).
  db.exec("begin immediate");
  try {
    db.prepare(`update menu_items set price = ?, updated_at = ? where id = ?`).run(
      proposal.payload.newPrice, now, proposal.payload.menuItemId
    );
    db.prepare(
      `update ai_action_proposals set status = 'approved', approved_by_profile_id = ?, resolved_at = ?, updated_at = ? where id = ?`
    ).run(actor.profileId, now, now, proposalId);
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    throw e;
  }

  const updated = db
    .prepare(
      `select id, restaurant_id as restaurantId, initiated_by_profile_id as initiatedByProfileId, capability, payload,
              status, approved_by_profile_id as approvedByProfileId, resolved_at as resolvedAt, created_at as createdAt
       from ai_action_proposals where id = ?`
    )
    .get(proposalId);
  return rowToProposal(updated);
}

export function rejectProposal(proposalId: string, actor: Actor): Proposal {
  if (actor.type !== "human_staff") {
    throw new AuthorizationError("ai_cannot_approve", "An AI actor cannot resolve its own proposal.");
  }
  const db = getDb();
  const row = db.prepare(`select restaurant_id as restaurantId, status from ai_action_proposals where id = ?`).get(proposalId) as
    | { restaurantId: string; status: string }
    | undefined;
  if (!row) throw new AuthorizationError("not_found", "Proposal not found.");
  if (row.restaurantId !== actor.restaurantId) throw new AuthorizationError("forbidden", "This proposal does not belong to your restaurant.");
  if (row.status !== "awaiting_approval") throw new AuthorizationError("already_resolved", `Proposal is already ${row.status}.`);

  const now = nowIso();
  db.prepare(`update ai_action_proposals set status = 'rejected', approved_by_profile_id = ?, resolved_at = ?, updated_at = ? where id = ?`).run(
    actor.profileId, now, now, proposalId
  );

  const updated = db
    .prepare(
      `select id, restaurant_id as restaurantId, initiated_by_profile_id as initiatedByProfileId, capability, payload,
              status, approved_by_profile_id as approvedByProfileId, resolved_at as resolvedAt, created_at as createdAt
       from ai_action_proposals where id = ?`
    )
    .get(proposalId);
  return rowToProposal(updated);
}
