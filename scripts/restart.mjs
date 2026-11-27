// `npm run restart`: stops every copy of the app that is still running (an old one blocks a
// new one from starting), clears Next's cache, then starts the app fresh on port 3000.
import { execSync, spawn } from "node:child_process";
import { rmSync } from "node:fs";

const me = process.pid;
let stopped = 0;
try {
  const rows = execSync("ps -eo pid=,args=", { encoding: "utf8" }).split("\n");
  for (const row of rows) {
    const m = row.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const [pid, args] = [Number(m[1]), m[2]];
    if (pid === me || pid === process.ppid) continue;
    // Only the app itself: "node …/next dev" and its "next-server" worker.
    if (/^\S*node\S*\s+\S*\/next\s+dev\b/.test(args) || /^\[?next-server\b/.test(args)) {
      try {
        process.kill(pid, "SIGTERM");
        stopped++;
      } catch {
        /* already gone */
      }
    }
  }
} catch {
  /* no ps on this system: nothing to stop */
}
console.log(stopped ? `Stopped ${stopped} old app process${stopped === 1 ? "" : "es"}.` : "No old copy of the app was running.");

// Give the old server a moment to let go of port 3000.
await new Promise((r) => setTimeout(r, stopped ? 1500 : 0));
rmSync(".next", { recursive: true, force: true });
console.log("Cleared the .next cache. Starting the app…\n");

const child = spawn("npx", ["next", "dev"], { stdio: "inherit", env: { ALLOW_LOCAL_TARGETS: "true", ...process.env } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
