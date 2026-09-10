import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes, randomUUID } from "node:crypto";

// ----------------------------------------------------------------------------
// Prototype note: this stands in for Supabase Postgres + Auth (see database/
// schema.sql and database/RLS.md from the original spec). SQLite via Node's
// built-in node:sqlite avoids needing a native build toolchain, which this
// environment doesn't have. Authorization that RLS would enforce in Postgres
// is enforced here in the API route handlers instead (see src/lib/auth.ts and
// the `scopedTo*` helpers below) — same rules, different enforcement layer.
// ----------------------------------------------------------------------------

const DB_PATH = process.env.APPYRA_DB_PATH || path.join(process.cwd(), "data", "appyra.db");

declare global {
  var __appyraDb: DatabaseSync | undefined;
}

export function uuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64).toString("hex");
  if (check.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ check.charCodeAt(i);
  return diff === 0;
}

const SCHEMA_SQL = `
pragma foreign_keys = on;

create table if not exists auth_users (
  id            text primary key,
  email         text unique,
  password_hash text,
  phone_number  text unique,
  user_type     text not null check (user_type in ('staff','customer')),
  created_at    text not null
);

create table if not exists restaurants (
  id                     text primary key,
  name                   text not null,
  slug                   text not null unique,
  email                  text unique,
  description            text,
  phone                  text,
  hours                  text, -- json
  is_temporarily_closed  integer not null default 0,
  temporary_closure_note text,
  is_active              integer not null default 1,
  created_at             text not null,
  updated_at             text not null
);

create table if not exists profiles (
  id            text primary key references auth_users(id) on delete cascade,
  restaurant_id text not null references restaurants(id) on delete cascade,
  created_at    text not null,
  updated_at    text not null,
  unique (restaurant_id)
);

create table if not exists customer_profiles (
  id           text primary key references auth_users(id) on delete cascade,
  phone_number text not null unique,
  name         text,
  created_at   text not null,
  updated_at   text not null
);

create table if not exists restaurant_images (
  id            text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  image_url     text not null,
  display_order integer not null default 0,
  created_at    text not null
);

create table if not exists menus (
  id            text primary key,
  restaurant_id text not null references restaurants(id) on delete cascade,
  name          text not null default 'Main Menu',
  created_at    text not null,
  updated_at    text not null,
  unique (restaurant_id)
);

create table if not exists menu_categories (
  id            text primary key,
  menu_id       text not null references menus(id) on delete cascade,
  name          text not null,
  display_order integer not null default 0,
  created_at    text not null,
  updated_at    text not null
);

create table if not exists menu_items (
  id            text primary key,
  category_id   text not null references menu_categories(id) on delete cascade,
  name          text not null,
  description   text,
  price         real not null check (price >= 0),
  image_url     text,
  is_available  integer not null default 1,
  display_order integer not null default 0,
  created_at    text not null,
  updated_at    text not null
);

create table if not exists reservations (
  id                  text primary key,
  restaurant_id       text not null references restaurants(id) on delete cascade,
  customer_profile_id text references customer_profiles(id) on delete set null,
  customer_name       text not null,
  customer_phone      text not null,
  reservation_date    text not null,
  reservation_time    text not null,
  guest_count         integer not null check (guest_count > 0),
  status              text not null default 'pending'
                        check (status in ('pending','confirmed','cancelled','no_show','completed')),
  notes               text,
  created_at          text not null,
  updated_at          text not null
);

create trigger if not exists trg_reservations_immutable
before update on reservations
when new.id != old.id
  or new.restaurant_id != old.restaurant_id
  or new.customer_name != old.customer_name
  or new.customer_phone != old.customer_phone
  or (new.customer_profile_id is not old.customer_profile_id)
  or new.reservation_date != old.reservation_date
  or new.reservation_time != old.reservation_time
  or new.guest_count != old.guest_count
  or new.created_at != old.created_at
begin
  select raise(abort, 'Only status and notes may be updated on an existing reservation');
end;

create table if not exists orders (
  id                  text primary key,
  restaurant_id       text not null references restaurants(id) on delete cascade,
  customer_profile_id text references customer_profiles(id) on delete set null,
  customer_name       text not null,
  customer_phone      text not null,
  status              text not null default 'pending'
                        check (status in ('pending','accepted','ready','completed','cancelled')),
  total_amount        real not null default 0 check (total_amount >= 0),
  notes               text,
  created_at          text not null,
  updated_at          text not null
);

create trigger if not exists trg_orders_immutable
before update on orders
when new.id != old.id
  or new.restaurant_id != old.restaurant_id
  or new.customer_name != old.customer_name
  or new.customer_phone != old.customer_phone
  or (new.customer_profile_id is not old.customer_profile_id)
  or new.total_amount != old.total_amount
  or new.created_at != old.created_at
begin
  select raise(abort, 'Only status and notes may be updated on an existing order');
end;

create table if not exists order_items (
  id           text primary key,
  order_id     text not null references orders(id) on delete cascade,
  menu_item_id text references menu_items(id) on delete set null,
  item_name    text not null,
  item_price   real not null check (item_price >= 0),
  quantity     integer not null check (quantity > 0),
  created_at   text not null
);

create table if not exists subscriptions (
  id                 text primary key,
  restaurant_id      text not null references restaurants(id) on delete cascade,
  plan               text not null default 'standard',
  monthly_price      real not null default 5000.00,
  status             text not null default 'active' check (status in ('active','past_due','cancelled')),
  started_at         text not null,
  next_billing_date  text,
  notes              text,
  created_at         text not null,
  updated_at         text not null,
  unique (restaurant_id)
);

create table if not exists ai_action_log (
  id                      text primary key,
  restaurant_id           text not null references restaurants(id) on delete cascade,
  initiated_by_profile_id text not null references profiles(id) on delete cascade,
  tool_name               text not null,
  requested_args          text,
  authorization_level     text not null check (authorization_level in ('auto','approval_required','human_only','never_exposed')),
  execution_status        text not null check (execution_status in ('succeeded','failed','blocked')),
  result_summary          text,
  created_at              text not null
);

-- insert-only, permanently: no role, including the app's own privileged
-- writer, may update or delete a log row once written.
create trigger if not exists trg_ai_action_log_no_update
before update on ai_action_log
begin
  select raise(abort, 'ai_action_log is insert-only and cannot be modified');
end;

create trigger if not exists trg_ai_action_log_no_delete
before delete on ai_action_log
begin
  select raise(abort, 'ai_action_log is insert-only and cannot be deleted');
end;

create table if not exists ai_action_proposals (
  id                      text primary key,
  restaurant_id           text not null references restaurants(id) on delete cascade,
  initiated_by_profile_id text not null references profiles(id) on delete cascade,
  capability              text not null,
  payload                 text not null,
  status                  text not null default 'awaiting_approval'
                            check (status in ('awaiting_approval','approved','rejected')),
  approved_by_profile_id  text references profiles(id) on delete set null,
  resolved_at             text,
  created_at              text not null,
  updated_at              text not null
);

create trigger if not exists trg_ai_action_proposals_immutable
before update on ai_action_proposals
when new.id != old.id
  or new.restaurant_id != old.restaurant_id
  or new.initiated_by_profile_id != old.initiated_by_profile_id
  or new.capability != old.capability
  or new.payload != old.payload
  or new.created_at != old.created_at
begin
  select raise(abort, 'Only status, approved_by_profile_id, and resolved_at may be updated on an existing AI action proposal');
end;

create table if not exists ai_idempotency_keys (
  restaurant_id    text not null,
  idempotency_key  text not null,
  order_id         text not null references orders(id) on delete cascade,
  created_at       text not null,
  primary key (restaurant_id, idempotency_key)
);

create index if not exists idx_reservations_restaurant on reservations(restaurant_id);
create index if not exists idx_orders_restaurant on orders(restaurant_id);
create index if not exists idx_menu_items_category on menu_items(category_id);
create index if not exists idx_ai_action_log_restaurant on ai_action_log(restaurant_id, created_at desc);
create index if not exists idx_ai_proposals_restaurant on ai_action_proposals(restaurant_id, status);
`;

function seed(db: DatabaseSync) {
  const count = db.prepare("select count(*) as c from restaurants").get() as { c: number };
  if (count.c > 0) return;

  const now = nowIso();

  function insertRestaurant(opts: {
    name: string; slug: string; email: string; description: string; phone: string;
    hours: Record<string, { open: string; close: string }>;
    staffEmail: string; staffPassword: string;
  }) {
    const restaurantId = uuid();
    db.prepare(
      `insert into restaurants (id, name, slug, email, description, phone, hours, is_temporarily_closed, temporary_closure_note, is_active, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 0, null, 1, ?, ?)`
    ).run(restaurantId, opts.name, opts.slug, opts.email, opts.description, opts.phone, JSON.stringify(opts.hours), now, now);

    const staffUserId = uuid();
    db.prepare(
      `insert into auth_users (id, email, password_hash, phone_number, user_type, created_at) values (?, ?, ?, null, 'staff', ?)`
    ).run(staffUserId, opts.staffEmail, hashPassword(opts.staffPassword), now);
    db.prepare(`insert into profiles (id, restaurant_id, created_at, updated_at) values (?, ?, ?, ?)`).run(
      staffUserId, restaurantId, now, now
    );

    db.prepare(
      `insert into subscriptions (id, restaurant_id, plan, monthly_price, status, started_at, next_billing_date, notes, created_at, updated_at)
       values (?, ?, 'standard', 5000.00, 'active', ?, ?, 'Seed data — manually tracked, founder-managed.', ?, ?)`
    ).run(uuid(), restaurantId, now.slice(0, 10), now.slice(0, 10), now, now);

    const menuId = uuid();
    db.prepare(`insert into menus (id, restaurant_id, name, created_at, updated_at) values (?, ?, 'Main Menu', ?, ?)`).run(
      menuId, restaurantId, now, now
    );

    return { restaurantId, menuId, staffUserId };
  }

  function insertCategory(menuId: string, name: string, order: number) {
    const id = uuid();
    db.prepare(`insert into menu_categories (id, menu_id, name, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`).run(
      id, menuId, name, order, now, now
    );
    return id;
  }

  function insertItem(categoryId: string, name: string, description: string, price: number, order: number, available = true) {
    const id = uuid();
    db.prepare(
      `insert into menu_items (id, category_id, name, description, price, image_url, is_available, display_order, created_at, updated_at)
       values (?, ?, ?, ?, ?, null, ?, ?, ?, ?)`
    ).run(id, categoryId, name, description, price, available ? 1 : 0, order, now, now);
    return id;
  }

  // --- Restaurant 1: Habesha Kitchen (reservations + ordering) ---
  const r1 = insertRestaurant({
    name: "Habesha Kitchen",
    slug: "habesha-kitchen",
    email: "hello@habeshakitchen.et",
    description: "Traditional Ethiopian dishes served on injera, family recipes since 1998.",
    phone: "+251911223344",
    hours: {
      mon: { open: "09:00", close: "22:00" }, tue: { open: "09:00", close: "22:00" },
      wed: { open: "09:00", close: "22:00" }, thu: { open: "09:00", close: "22:00" },
      fri: { open: "09:00", close: "23:00" }, sat: { open: "10:00", close: "23:00" },
      sun: { open: "10:00", close: "21:00" },
    },
    staffEmail: "staff@habeshakitchen.et",
    staffPassword: "appyra123",
  });
  const mains1 = insertCategory(r1.menuId, "Mains", 0);
  const drinks1 = insertCategory(r1.menuId, "Drinks", 1);
  const itemDoroWat = insertItem(mains1, "Doro Wat", "Spiced chicken stew with berbere, served with injera.", 250, 0);
  insertItem(mains1, "Tibs", "Sauteed beef with onions, peppers, and rosemary.", 300, 1);
  insertItem(mains1, "Shiro", "Spiced chickpea stew, vegan.", 180, 2);
  insertItem(mains1, "Kitfo", "Minced beef, lightly spiced, served raw or cooked.", 320, 3, false);
  insertItem(drinks1, "Ethiopian Coffee", "Traditional coffee ceremony cup.", 60, 0);
  insertItem(drinks1, "Tej (Honey Wine)", "House-made honey wine.", 120, 1);

  // --- Restaurant 2: Addis Cafe (order-only, no reservations focus) ---
  const r2 = insertRestaurant({
    name: "Addis Cafe",
    slug: "addis-cafe",
    email: "hello@addiscafe.et",
    description: "Fast counter-service cafe — pastries, sandwiches, coffee.",
    phone: "+251922334455",
    hours: {
      mon: { open: "07:00", close: "20:00" }, tue: { open: "07:00", close: "20:00" },
      wed: { open: "07:00", close: "20:00" }, thu: { open: "07:00", close: "20:00" },
      fri: { open: "07:00", close: "20:00" }, sat: { open: "08:00", close: "18:00" },
      sun: { open: "08:00", close: "16:00" },
    },
    staffEmail: "staff@addiscafe.et",
    staffPassword: "appyra123",
  });
  const bakery2 = insertCategory(r2.menuId, "Bakery", 0);
  const coffee2 = insertCategory(r2.menuId, "Coffee", 1);
  insertItem(bakery2, "Sambusa (3pc)", "Fried pastry with spiced lentil filling.", 45, 0);
  insertItem(bakery2, "Croissant", "Butter croissant, baked fresh.", 55, 1);
  insertItem(coffee2, "Macchiato", "Espresso with a dash of milk.", 40, 0);
  insertItem(coffee2, "Buna", "Ethiopian black coffee.", 30, 1);

  // Sample reservations + an order for Habesha Kitchen, so the dashboard isn't empty on first load.
  db.prepare(
    `insert into reservations (id, restaurant_id, customer_profile_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, status, notes, created_at, updated_at)
     values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), r1.restaurantId, "Sara Tesfaye", "+251911000111", "2026-09-12", "19:30", 4, "pending", "Window table if possible", now, now);
  db.prepare(
    `insert into reservations (id, restaurant_id, customer_profile_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, status, notes, created_at, updated_at)
     values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), r1.restaurantId, "Yonas Bekele", "+251911000222", "2026-09-11", "13:00", 2, "confirmed", null, now, now);

  const sampleOrderId = uuid();
  db.prepare(
    `insert into orders (id, restaurant_id, customer_profile_id, customer_name, customer_phone, status, total_amount, notes, created_at, updated_at)
     values (?, ?, null, ?, ?, 'pending', ?, null, ?, ?)`
  ).run(sampleOrderId, r1.restaurantId, "Marta Alemu", "+251911000333", 250, now, now);
  db.prepare(
    `insert into order_items (id, order_id, menu_item_id, item_name, item_price, quantity, created_at) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), sampleOrderId, itemDoroWat, "Doro Wat", 250, 1, now);
}

export function getDb(): DatabaseSync {
  if (globalThis.__appyraDb) return globalThis.__appyraDb;

  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA_SQL);
  seed(db);

  globalThis.__appyraDb = db;
  return db;
}
