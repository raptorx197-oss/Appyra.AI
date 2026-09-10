import { getDb } from "./db";
import { PublicMenuCategory, PublicRestaurant } from "./types";

export function getRestaurantBySlug(slug: string): PublicRestaurant | null {
  const db = getDb();
  const row = db
    .prepare(
      `select id, name, slug, description, phone, hours, is_temporarily_closed as isTemporarilyClosed,
              temporary_closure_note as temporaryClosureNote
       from restaurants where slug = ? and is_active = 1`
    )
    .get(slug) as
    | {
        id: string; name: string; slug: string; description: string | null; phone: string | null;
        hours: string | null; isTemporarilyClosed: number; temporaryClosureNote: string | null;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    phone: row.phone,
    hours: row.hours ? JSON.parse(row.hours) : null,
    isTemporarilyClosed: !!row.isTemporarilyClosed,
    temporaryClosureNote: row.temporaryClosureNote,
  };
}

export function getRestaurantById(id: string): PublicRestaurant | null {
  const db = getDb();
  const row = db
    .prepare(
      `select id, name, slug, description, phone, hours, is_temporarily_closed as isTemporarilyClosed,
              temporary_closure_note as temporaryClosureNote
       from restaurants where id = ?`
    )
    .get(id) as
    | {
        id: string; name: string; slug: string; description: string | null; phone: string | null;
        hours: string | null; isTemporarilyClosed: number; temporaryClosureNote: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    phone: row.phone,
    hours: row.hours ? JSON.parse(row.hours) : null,
    isTemporarilyClosed: !!row.isTemporarilyClosed,
    temporaryClosureNote: row.temporaryClosureNote,
  };
}

export function getMenuForRestaurant(restaurantId: string): PublicMenuCategory[] {
  const db = getDb();
  const categories = db
    .prepare(
      `select mc.id, mc.name from menu_categories mc
       join menus m on m.id = mc.menu_id
       where m.restaurant_id = ? order by mc.display_order`
    )
    .all(restaurantId) as Array<{ id: string; name: string }>;

  const itemStmt = db.prepare(
    `select id, name, description, price, is_available as isAvailable
     from menu_items where category_id = ? order by display_order`
  );

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: (
      itemStmt.all(c.id) as Array<{ id: string; name: string; description: string | null; price: number; isAvailable: number }>
    ).map((i) => ({ ...i, isAvailable: !!i.isAvailable })),
  }));
}
