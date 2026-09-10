#!/usr/bin/env node
/**
 * Readiness check — run `npm run ready` before you demo, deploy, or hand this
 * to anyone.
 *
 * It answers one question: does this app actually work on this machine right
 * now? Each step either passes or explains exactly what to do about it.
 *
 * Deliberately included: a live boot check. `npm run build` succeeding does
 * NOT mean the app serves a request — that gap is exactly how the Vercel
 * preview shipped a green build that returns HTTP 500 on every page. The last
 * step starts the real server and fetches a real page.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import process from "node:process";

const PORT = Number(process.env.READY_PORT || 3111);
// Spawn the real binary, not the `npx` wrapper: npx does not forward signals
// to what it launches.
const NEXT_BIN = "node_modules/next/dist/bin/next";
const results = [];
let hardFail = false;

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function step(name, fn, { fixHint = null } = {}) {
  process.stdout.write(`${c.dim}…${c.reset} ${name}`);
  try {
    const detail = fn();
    process.stdout.write(`\r${c.green}✓${c.reset} ${name}${detail ? `  ${c.dim}${detail}${c.reset}` : ""}\n`);
    results.push({ name, ok: true });
  } catch (err) {
    hardFail = true;
    process.stdout.write(`\r${c.red}✗${c.reset} ${name}\n`);
    const msg = String(err.message || err).trim().split("\n").slice(0, 6).join("\n");
    console.log(`${c.dim}${msg.replace(/^/gm, "    ")}${c.reset}`);
    if (fixHint) console.log(`  ${c.yellow}fix:${c.reset} ${fixHint}`);
    results.push({ name, ok: false });
  }
}

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

console.log(`\n${c.bold}Appyra readiness check${c.reset}\n`);

// ---------------------------------------------------------------- environment
step("Node 22.6 or newer", () => {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 6)) {
    throw new Error(`found Node ${process.versions.node}. The data layer uses the built-in node:sqlite and the test runner uses --experimental-strip-types; neither exists before 22.6.`);
  }
  return `v${process.versions.node}`;
}, { fixHint: "install Node 22.6+ (nvm install 22)" });

step("dependencies installed", () => {
  if (!existsSync("node_modules/next")) throw new Error("node_modules/next is missing.");
  return "node_modules present";
}, { fixHint: "npm install" });

step("build config present", () => {
  // Each of these is load-bearing and each was missing at least once:
  //   postcss.config.mjs  — without it Tailwind v4 compiles zero styles
  //   eslint.config.mjs   — without it `npm run lint` cannot start
  const required = ["postcss.config.mjs", "eslint.config.mjs", "next.config.ts", "tsconfig.json"];
  const missing = required.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
  return required.length + " files";
});

// ------------------------------------------------------------------- quality
step("lint", () => { run("npm run lint"); return "no findings"; },
  { fixHint: "npx eslint --fix ." });

step("tests", () => {
  const out = run("npm test");
  const pass = /^# pass (\d+)$/m.exec(out)?.[1];
  const fail = /^# fail (\d+)$/m.exec(out)?.[1];
  if (fail && fail !== "0") throw new Error(`${fail} test(s) failing.`);
  return `${pass}/${pass} passing`;
}, { fixHint: "npm test  — read the failing assertion, it names the security property that broke" });

step("production build", () => {
  const out = run("npm run build");
  const routes = (out.match(/^[├└┌]\s+[ƒ○]/gm) || []).length;
  return routes ? `${routes} routes` : "compiled";
}, { fixHint: "npm run build  — the TypeScript errors are listed in full" });

// --------------------------------------------------------- does it actually run
if (!hardFail) {
  await step_serve();
} else {
  console.log(`${c.dim}⊘${c.reset} live boot check  ${c.dim}(skipped — fix the failures above first)${c.reset}`);
  results.push({ name: "live boot check", ok: false });
}

async function step_serve() {
  process.stdout.write(`${c.dim}…${c.reset} live boot check`);
  rmSync("data/appyra.ready.db", { force: true });
  // detached:true makes the child a process-group leader so the whole group
  // can be signalled below. Without it, SIGTERM reaches only the wrapper and
  // next-server survives as an orphan holding the port — one leaked process
  // per run, and EADDRINUSE on the next one.
  const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    env: { ...process.env, APPYRA_DB_PATH: "data/appyra.ready.db" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const exited = new Promise((resolve) => server.once("exit", resolve));
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; });
  server.stderr.on("data", (d) => { serverLog += d; });

  const deadline = Date.now() + 40_000;
  let status = 0;
  let body = "";
  try {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/`);
        status = res.status;
        body = await res.text();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (status !== 200) {
      throw new Error(
        status === 0
          ? `server never accepted a connection within 40s.\n${serverLog.slice(-600)}`
          : `GET / returned HTTP ${status}. A build can succeed and the app still not serve.\n${serverLog.slice(-600)}`
      );
    }
    if (!body.includes("Restaurants on Appyra")) {
      throw new Error("GET / returned 200 but not the discovery page — the database may not have seeded.");
    }
    process.stdout.write(`\r${c.green}✓${c.reset} live boot check  ${c.dim}GET / → 200, database seeded${c.reset}\n`);
    results.push({ name: "live boot check", ok: true });
  } catch (err) {
    hardFail = true;
    process.stdout.write(`\r${c.red}✗${c.reset} live boot check\n`);
    console.log(`${c.dim}${String(err.message).replace(/^/gm, "    ")}${c.reset}`);
    results.push({ name: "live boot check", ok: false });
  } finally {
    await stopServer(server, exited);
    rmSync("data/appyra.ready.db", { force: true });
  }
}

/** Signals the server's whole process group and waits for it to actually go. */
async function stopServer(server, exited) {
  const signalGroup = (sig) => {
    try { process.kill(-server.pid, sig); }
    catch { try { server.kill(sig); } catch { /* already gone */ } }
  };
  signalGroup("SIGTERM");
  const died = await Promise.race([
    exited.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 5000)),
  ]);
  if (!died) {
    signalGroup("SIGKILL");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
  }
}

// ------------------------------------------------------------------- verdict
const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length === 0) {
  console.log(`${c.green}${c.bold}Ready.${c.reset} ${results.length}/${results.length} checks passed.`);
  console.log(`${c.dim}Start it with:  npm run dev  →  http://localhost:3000${c.reset}`);
  console.log(`${c.dim}Staff login:    staff@habeshakitchen.et / appyra123  (dev fixture)${c.reset}`);
} else {
  console.log(`${c.red}${c.bold}Not ready.${c.reset} ${failed.length} of ${results.length} checks failed: ${failed.map((f) => f.name).join(", ")}`);
}

console.log(`\n${c.dim}This checks that the app runs HERE, on a normal filesystem. It cannot`);
console.log(`tell you whether it runs on serverless — the SQLite layer needs a writable`);
console.log(`disk, which Vercel does not provide. See "Known gaps" in the README.${c.reset}\n`);

process.exit(failed.length ? 1 : 0);
