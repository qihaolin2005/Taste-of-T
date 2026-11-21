// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// One command to try the app on an iPhone:
//   npm run dev:phone
// 1. Starts `next dev` on port 3000 (or reuses one that's already running).
// 2. Waits until it actually answers, then opens a free HTTPS tunnel (cloudflared).
// 3. Prints the tunnel link + a QR code: scan it with the iPhone camera, open in Safari.
// Ctrl+C stops everything.
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import QRCode from "qrcode";

const PORT = 3000;
const LOCAL = `http://localhost:${PORT}`;
const bin = (name: string) => path.join(process.cwd(), "node_modules", ".bin", name);

const children: ChildProcess[] = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) if (!c.killed) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUntilUp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startNext(): ChildProcess {
  // Inherit stdio so the usual Next.js logs and errors show up as normal.
  const next = spawn(bin("next"), ["dev", "-H", "0.0.0.0", "-p", String(PORT)], { stdio: "inherit" });
  next.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`\n✖ next dev stopped (exit ${code}). Stopping the tunnel too.`);
      shutdown(code ?? 1);
    }
  });
  children.push(next);
  return next;
}

/** Start cloudflared and resolve with its public https URL. */
function startTunnel(): Promise<string> {
  return new Promise((resolve, reject) => {
    const tunnel = spawn(bin("cloudflared"), ["tunnel", "--no-autoupdate", "--url", LOCAL], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(tunnel);
    const timer = setTimeout(() => reject(new Error("Timed out waiting for the tunnel URL (is the internet up?)")), 45_000);
    const onData = (buf: Buffer) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    tunnel.stdout.on("data", onData);
    tunnel.stderr.on("data", onData); // cloudflared logs to stderr
    tunnel.on("exit", (code) => {
      clearTimeout(timer);
      if (!shuttingDown) {
        console.error(`\n✖ Tunnel stopped (exit ${code}). The phone link no longer works; rerun npm run dev:phone.`);
        shutdown(code ?? 1);
      }
      reject(new Error(`cloudflared exited (${code})`));
    });
  });
}

async function main() {
  if (await isUp()) {
    console.log(`• Reusing the app already running at ${LOCAL}`);
  } else {
    console.log("• Starting the app (next dev)...");
    startNext();
    if (!(await waitUntilUp(90_000))) {
      console.error(`✖ The app didn't come up on ${LOCAL}. Check the errors above.`);
      return shutdown(1);
    }
  }

  console.log("• App is up. Opening a secure tunnel for your phone...");
  const url = await startTunnel();
  // The tunnel URL can take a few seconds to start routing.
  await new Promise((r) => setTimeout(r, 2500));

  const qr = await QRCode.toString(url, { type: "terminal", small: true });
  console.log(`
────────────────────────────────────────────────────────────
  📱  Scan with your iPhone camera, open in Safari:

${qr}
  ${url}

  Install: Share → Add to Home Screen
  On this computer: ${LOCAL}/demo (iPhone frame)

  Google Maps on the phone? Allow *.trycloudflare.com/* on your key.
  This link is public while it runs. Ctrl+C stops everything.
────────────────────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  shutdown(1);
});
