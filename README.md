# Appyra — Restaurant Operations Prototype

A working Next.js prototype of the Appyra restaurant operating system: public
discovery and ordering, a staff dashboard, and an AI assistant whose
high-risk actions are **structurally** incapable of executing without human
approval.

> **Status: prototype, not production.** Persistence is local SQLite, not
> Supabase Postgres. Auth is a signed cookie, not Supabase Auth. There is no
> online payment — V1 is pay-at-pickup by design.

## Running it

```bash
npm install
npm run ready    # verify everything works before you demo or deploy
npm run dev      # http://localhost:3000
```

`npm run ready` is the one command to run before showing this to anyone. It
checks the Node version, the build config, lint, the test suite, a production
build, and — the step CI alone does not give you — **it boots the real server
and fetches a real page**. A green build does not prove the app serves a
request; that gap is exactly how the Vercel preview shipped a passing build
that returns HTTP 500 on every route.

It prints a per-step verdict and, on failure, what to do about it:

```
Appyra readiness check

✓ Node 22.6 or newer        v22.22.2
✓ dependencies installed    node_modules present
✓ build config present      4 files
✓ lint                      no findings
✓ tests                     16/16 passing
✓ production build          28 routes
✓ live boot check           GET / → 200, database seeded

Ready. 7/7 checks passed.
```

### Try it as a user

Seeded restaurants are **Habesha Kitchen** (`/r/habesha-kitchen`) and
**Addis Cafe** (`/r/addis-cafe`). Browse a menu, add items, place a pickup
order, or book a table — no account needed.

For the staff side, sign in at `/dashboard` with
`staff@habeshakitchen.et` / `appyra123` (dev fixture). The **AI Assistant**
tab is where the authorization model is visible: ask it for the menu and it
answers directly; ask it to change a price and it can only file a proposal
you approve under **Proposals**; ask it to `call change_payout_destination`
and it is blocked, with the attempt recorded in **Activity Log**.

Requires **Node 22.6+** — the data layer uses the built-in `node:sqlite`, and
the test runner uses `--experimental-strip-types`.

The database seeds itself on first boot at `data/appyra.db` (gitignored).
Seeded staff logins are dev-only credentials printed in `src/lib/db.ts`.

```bash
npm run lint     # eslint (flat config, eslint-config-next 16)
npm test         # node:test — 16 tests covering the AI authorization model
npm run build    # production build, 28 routes
```

## Surfaces

| Route | What it is | Auth |
|---|---|---|
| `/` | Restaurant discovery | none |
| `/r/[slug]` | Menu, pickup ordering, table reservation | none |
| `/guest` + `/guest/orders/[id]`, `/guest/reservations/[id]` | Guest status lookup by reference | none |
| `/dashboard` | Staff: menu, orders, reservations, profile, AI assistant, proposals, audit log | signed cookie |

## The part that matters: the AI authorization model

Every AI capability is classified, and the classification is enforced by what
code exists — not by a prompt instruction or a runtime permission check that
could have a bug in it.

| Level | Meaning | Example |
|---|---|---|
| `auto` | AI executes directly | `check_menu`, `calculate_order_total`, `create_order` |
| `approval_required` | AI can only *propose*; a human staff member applies it | `propose_price_change` |
| `human_only` | No tool exists | refunds |
| `never_exposed` | No tool exists, and calling the name is logged as blocked | `change_payout_destination` |

Load-bearing properties, each covered by a test in `src/lib/ai/core.test.ts`:

- **Prices are never taken from the model.** `create_order` re-reads
  authoritative prices from the database and ignores any price in the tool args.
- **A proposal never self-applies.** Only `approveProposal`, called by a
  `human_staff` actor in the same restaurant, mutates the price.
- **Cross-restaurant isolation holds in both directions.** Restaurant A's
  actor cannot see B's menu, and B's cannot see A's.
- **Unregistered tool names cannot dispatch.** There is no dynamic dispatch
  beyond the `TOOL_REGISTRY` lookup, so a smuggled tool name resolves to
  "no such tool" and is logged as `blocked`.
- **The audit log is append-only.** Every dispatch — succeeded, failed, or
  blocked — is written, and rows cannot be updated even by direct SQL.

The assistant runs on a local rule-based provider by default. Set
`ANTHROPIC_API_KEY` to switch to the Anthropic Messages API provider; the
tool-authorization layer is identical either way.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `APPYRA_DB_PATH` | `data/appyra.db` | SQLite file location |
| `APPYRA_SESSION_SECRET` | insecure dev fallback | **Must be set in any deployed environment** |
| `ANTHROPIC_API_KEY` | unset | Switches the assistant to the Anthropic provider |

## Known gaps before this is production

1. SQLite → Supabase Postgres, with the API-route authorization rules
   re-expressed as RLS policies.
2. Cookie auth → Supabase Auth.
3. `APPYRA_SESSION_SECRET` has an insecure default; deployment must fail
   closed if it is unset.
4. Seeded staff passwords are dev fixtures and must not survive seeding
   against a real database.
