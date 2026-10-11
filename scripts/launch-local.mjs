import { spawn } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error("Install Node.js 22.13 or newer from https://nodejs.org/.");
  process.exit(1);
}
const port = Number(process.env.PIP_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PIP_PORT must be between 1024 and 65535.");

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Command failed with exit code ${code}.`)));
  });
}
if (!existsSync("node_modules/vinext/package.json")) {
  console.log("First run: installing dependencies. Internet access is required; this can take several minutes.");
  const npm = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (existsSync(npm)) await run(process.execPath, [npm, "install"]);
  else await run(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/c", "npm install"] : ["install"]);
}
if (!existsSync(".env") && !existsSync(".env.local")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env. Add your own NVIDIA_API_KEY and ELEVENLABS_API_KEY there, then restart Pip. You can explore Demo mode in Settings without keys.");
}
// Never kill another server or silently switch origins: browser workspaces belong to their origin.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error(`Port ${port} is already in use. Close the other Pip server window first, or set PIP_PORT to another port.`)));
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
const url = `http://127.0.0.1:${port}/`;
console.log(`Starting Pip at ${url} Keep this window open. Press Ctrl+C to stop.`);
const server = spawn(process.execPath, ["scripts/run-framework.mjs", "dev", "--host", "127.0.0.1", "--port", String(port)], {cwd: root, stdio: "inherit", windowsHide: true});
let stopped = false, opened = false;
server.once("error", error => { console.error(error.message); process.exitCode = 1; stopped = true; });
server.once("exit", code => { stopped = true; process.exitCode = code ?? 1; });
process.on("SIGINT", () => { stopped = true; server.kill(); });
process.on("SIGTERM", () => { stopped = true; server.kill(); });
const deadline = Date.now() + 90000;
while (!stopped && !opened && Date.now() < deadline) {
  try {
    const response = await fetch(url + "api/ai", {signal: AbortSignal.timeout(2000)});
    if (response.ok) {
      opened = true;
      if (process.env.PIP_NO_BROWSER !== "1") {
        const open = process.platform === "win32" ? spawn("cmd.exe", ["/d", "/c", "start", "", url], {windowsHide: true}) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url]);
        open.on("error", () => console.log(`Open ${url} in your browser.`));
      }
      console.log(`Pip is ready: ${url}`);
    }
  } catch { /* The server is still compiling; try again. */ }
  if (!opened && !stopped) await new Promise(resolve => setTimeout(resolve, 500));
}
if (!opened && !stopped) console.log(`Startup is taking longer than expected. Check the server output above, then open ${url}.`);
