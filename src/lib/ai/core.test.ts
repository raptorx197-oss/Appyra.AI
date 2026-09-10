import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getDb, uuid, nowIso } from "../db.ts";
import { dispatchTool, approveProposal, rejectProposal, AuthorizationError, TOOL_REGISTRY } from "./core.ts";
import type { Actor } from "./core.ts";

// Thin expect() shim so the assertions below read the same as the vitest
// style this suite started from, while actually running on node:test —
// avoids the Vite dep-optimizer choking on the "node:sqlite" specifier
// (see the note in ../db.ts).
function expect<T>(actual: T) {
  return {
    toBe(expected: unknown) {
      assert.strictEqual(actual, expected);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeGreaterThan(n: number) {
      assert.ok((actual as unknown as number) > n);
    },
    toThrow(ctor?: unknown) {
      const block = actual as unknown as () => unknown;
      if (ctor === undefined) assert.throws(block);
      else assert.throws(block, ctor as assert.AssertPredicate);
    },
  };
}

// ============================================================================
// This is the executable proof for docs/AI.md's security properties —
// mirrors the 14-test suite the spec describes for prototype/core.ts.
// Run with: npm run test
// ============================================================================

type Fixture = {
  restaurantId: string;
  profileId: string;
  availableItemId: string;
  unavailableItemId: string;
  itemPrice: number;
};

function setupRestaurant(label: string): Fixture {
  const db = getDb();
  const now = nowIso();
  const restaurantId = uuid();
  db.prepare(
    `insert into restaurants (id, name, slug, email, description, phone, hours, is_temporarily_closed, temporary_closure_note, is_active, created_at, updated_at)
     values (?, ?, ?, ?, null, null, null, 0, null, 1, ?, ?)`
  ).run(restaurantId, `Test Restaurant ${label}`, `test-${label}-${restaurantId.slice(0, 8)}`, `${label}-${restaurantId.slice(0, 8)}@test.local`, now, now);

  const userId = uuid();
  db.prepare(`insert into auth_users (id, email, password_hash, phone_number, user_type, created_at) values (?, ?, 'x', null, 'staff', ?)`).run(
    userId, `staff-${label}-${userId.slice(0, 8)}@test.local`, now
  );
  db.prepare(`insert into profiles (id, restaurant_id, created_at, updated_at) values (?, ?, ?, ?)`).run(userId, restaurantId, now, now);

  const menuId = uuid();
  db.prepare(`insert into menus (id, restaurant_id, name, created_at, updated_at) values (?, ?, 'Main', ?, ?)`).run(menuId, restaurantId, now, now);
  const categoryId = uuid();
  db.prepare(`insert into menu_categories (id, menu_id, name, display_order, created_at, updated_at) values (?, ?, 'Mains', 0, ?, ?)`).run(
    categoryId, menuId, now, now
  );

  const itemPrice = 100;
  const availableItemId = uuid();
  db.prepare(
    `insert into menu_items (id, category_id, name, description, price, image_url, is_available, display_order, created_at, updated_at)
     values (?, ?, 'Test Dish', null, ?, null, 1, 0, ?, ?)`
  ).run(availableItemId, categoryId, itemPrice, now, now);

  const unavailableItemId = uuid();
  db.prepare(
    `insert into menu_items (id, category_id, name, description, price, image_url, is_available, display_order, created_at, updated_at)
     values (?, ?, 'Sold Out Dish', null, 50, null, 0, 1, ?, ?)`
  ).run(unavailableItemId, categoryId, now, now);

  return { restaurantId, profileId: userId, availableItemId, unavailableItemId, itemPrice };
}

let A: Fixture;
let B: Fixture;
let aiActorA: Actor;
let humanActorA: Actor;
let aiActorB: Actor;
let humanActorB: Actor;

before(() => {
  A = setupRestaurant("A");
  B = setupRestaurant("B");
  aiActorA = { type: "ai", profileId: A.profileId, restaurantId: A.restaurantId };
  humanActorA = { type: "human_staff", profileId: A.profileId, restaurantId: A.restaurantId };
  aiActorB = { type: "ai", profileId: B.profileId, restaurantId: B.restaurantId };
  humanActorB = { type: "human_staff", profileId: B.profileId, restaurantId: B.restaurantId };
});

describe("create_order price integrity", () => {
  it("1. ignores a fabricated clientAssertedTotal and computes the real total server-side", () => {
    const outcome = dispatchTool(
      "create_order",
      {
        items: [{ menuItemId: A.availableItemId, quantity: 2 }],
        customerName: "Test Customer",
        customerPhone: "+251900000001",
        idempotencyKey: uuid(),
        clientAssertedTotal: 1,
      },
      aiActorA
    );
    expect(outcome.status).toBe("succeeded");
    if (outcome.status === "succeeded") {
      const order = outcome.result as { totalAmount: number };
      expect(order.totalAmount).toBe(A.itemPrice * 2);
    }
  });
});

describe("cross-restaurant isolation", () => {
  it("2. check_menu for restaurant A never returns restaurant B's items", () => {
    const outcome = dispatchTool("check_menu", {}, aiActorA);
    expect(outcome.status).toBe("succeeded");
    if (outcome.status === "succeeded") {
      const items = outcome.result as Array<{ id: string }>;
      expect(items.some((i) => i.id === A.availableItemId)).toBe(true);
      expect(items.some((i) => i.id === B.availableItemId)).toBe(false);
    }
  });

  it("2b. the same holds in reverse — check_menu for restaurant B never returns restaurant A's items", () => {
    const outcome = dispatchTool("check_menu", {}, aiActorB);
    expect(outcome.status).toBe("succeeded");
    if (outcome.status === "succeeded") {
      const items = outcome.result as Array<{ id: string }>;
      expect(items.some((i) => i.id === B.availableItemId)).toBe(true);
      expect(items.some((i) => i.id === A.availableItemId)).toBe(false);
    }
  });
});

describe("unavailable item rejection", () => {
  it("3. calculate_order_total rejects an unavailable item", () => {
    const outcome = dispatchTool("calculate_order_total", { items: [{ menuItemId: A.unavailableItemId, quantity: 1 }] }, aiActorA);
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.code).toBe("item_unavailable");
  });

  it("4. create_order rejects an unavailable item", () => {
    const outcome = dispatchTool(
      "create_order",
      { items: [{ menuItemId: A.unavailableItemId, quantity: 1 }], customerName: "X", customerPhone: "+251900000002", idempotencyKey: uuid() },
      aiActorA
    );
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.code).toBe("item_unavailable");
  });
});

describe("propose_price_change never applies immediately", () => {
  it("5. creates a proposal and leaves menu_items.price unchanged", () => {
    const before = getDb().prepare("select price from menu_items where id = ?").get(A.availableItemId) as { price: number };
    const outcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 999 }, aiActorA);
    expect(outcome.status).toBe("succeeded_awaiting_approval");
    const after = getDb().prepare("select price from menu_items where id = ?").get(A.availableItemId) as { price: number };
    expect(after.price).toBe(before.price);
  });
});

describe("approval boundary", () => {
  it("6. an AI actor cannot approve its own proposal", () => {
    const proposalOutcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 150 }, aiActorA);
    expect(proposalOutcome.status).toBe("succeeded_awaiting_approval");
    if (proposalOutcome.status !== "succeeded_awaiting_approval") return;
    expect(() => approveProposal(proposalOutcome.proposal.id, aiActorA)).toThrow(AuthorizationError);
  });

  it("7. staff cannot approve another restaurant's proposal", () => {
    const proposalOutcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 175 }, aiActorA);
    if (proposalOutcome.status !== "succeeded_awaiting_approval") throw new Error("setup failed");
    expect(() => approveProposal(proposalOutcome.proposal.id, humanActorB)).toThrow(AuthorizationError);
  });

  it("8. the right human_staff actor approving applies the change atomically", () => {
    const proposalOutcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 222 }, aiActorA);
    if (proposalOutcome.status !== "succeeded_awaiting_approval") throw new Error("setup failed");
    const approved = approveProposal(proposalOutcome.proposal.id, humanActorA);
    expect(approved.status).toBe("approved");
    const item = getDb().prepare("select price from menu_items where id = ?").get(A.availableItemId) as { price: number };
    expect(item.price).toBe(222);
  });

  it("9. rejecting a proposal leaves the price unchanged", () => {
    const before = getDb().prepare("select price from menu_items where id = ?").get(A.availableItemId) as { price: number };
    const proposalOutcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 777 }, aiActorA);
    if (proposalOutcome.status !== "succeeded_awaiting_approval") throw new Error("setup failed");
    const rejected = rejectProposal(proposalOutcome.proposal.id, humanActorA);
    expect(rejected.status).toBe("rejected");
    const after = getDb().prepare("select price from menu_items where id = ?").get(A.availableItemId) as { price: number };
    expect(after.price).toBe(before.price);
  });

  it("10. an already-resolved proposal cannot be approved again", () => {
    const proposalOutcome = dispatchTool("propose_price_change", { menuItemId: A.availableItemId, newPrice: 333 }, aiActorA);
    if (proposalOutcome.status !== "succeeded_awaiting_approval") throw new Error("setup failed");
    approveProposal(proposalOutcome.proposal.id, humanActorA);
    expect(() => approveProposal(proposalOutcome.proposal.id, humanActorA)).toThrow(AuthorizationError);
  });
});

describe("prompt injection / unregistered tools", () => {
  it("11. an arbitrary/malicious tool name resolves to blocked, not execution", () => {
    const outcome = dispatchTool("'; DROP TABLE menu_items; --", { anything: true }, aiActorA);
    expect(outcome.status).toBe("blocked");
    const stillThere = getDb().prepare("select count(*) as c from menu_items where category_id in (select id from menu_categories where menu_id in (select id from menus where restaurant_id = ?))").get(A.restaurantId) as { c: number };
    expect(stillThere.c).toBeGreaterThan(0);
  });

  it("12. change_payout_destination has no tool registered at all", () => {
    expect(TOOL_REGISTRY["change_payout_destination"]).toBeUndefined();
    const outcome = dispatchTool("change_payout_destination", { destination: "attacker-account" }, aiActorA);
    expect(outcome.status).toBe("blocked");
  });
});

describe("idempotency", () => {
  it("13. create_order with the same idempotencyKey does not create a duplicate order", () => {
    const key = uuid();
    const first = dispatchTool(
      "create_order",
      { items: [{ menuItemId: A.availableItemId, quantity: 1 }], customerName: "Retry Test", customerPhone: "+251900000003", idempotencyKey: key },
      aiActorA
    );
    const second = dispatchTool(
      "create_order",
      { items: [{ menuItemId: A.availableItemId, quantity: 1 }], customerName: "Retry Test", customerPhone: "+251900000003", idempotencyKey: key },
      aiActorA
    );
    expect(first.status).toBe("succeeded");
    expect(second.status).toBe("succeeded");
    if (first.status === "succeeded" && second.status === "succeeded") {
      expect((first.result as { id: string }).id).toBe((second.result as { id: string }).id);
    }
    const count = getDb().prepare("select count(*) as c from ai_idempotency_keys where restaurant_id = ? and idempotency_key = ?").get(A.restaurantId, key) as { c: number };
    expect(count.c).toBe(1);
  });
});

describe("audit log", () => {
  it("14. every dispatch call, success or failure or blocked, is written to ai_action_log", () => {
    const before = getDb().prepare("select count(*) as c from ai_action_log where restaurant_id = ?").get(A.restaurantId) as { c: number };
    dispatchTool("check_menu", {}, aiActorA); // succeeded
    dispatchTool("calculate_order_total", { items: [{ menuItemId: A.unavailableItemId, quantity: 1 }] }, aiActorA); // failed
    dispatchTool("not_a_real_tool", {}, aiActorA); // blocked
    const after = getDb().prepare("select count(*) as c from ai_action_log where restaurant_id = ?").get(A.restaurantId) as { c: number };
    expect(after.c).toBe(before.c + 3);
  });

  it("ai_action_log rows cannot be updated, even attempting it directly against the database", () => {
    const row = getDb().prepare("select id from ai_action_log where restaurant_id = ? limit 1").get(A.restaurantId) as { id: string };
    expect(() => getDb().prepare("update ai_action_log set result_summary = 'tampered' where id = ?").run(row.id)).toThrow();
  });
});
