import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "..");
const nextDir = path.join(frontendDir, ".next");

function findListeningPidsWin(ports) {
  const pids = new Set();
  try {
    const out = execSync("netstat -ano", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const portGroup = ports.join("|");
    const regex = new RegExp(`^\\s*TCP\\s+\\S+:(?:${portGroup})\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "i");
    for (const line of out.split(/\r?\n/)) {
      const match = line.match(regex);
      if (match) {
        const pid = Number.parseInt(match[1], 10);
        if (pid > 0 && pid !== process.pid && pid !== process.ppid) {
          pids.add(pid);
        }
      }
    }
  } catch {
    // Ignore netstat errors if unavailable
  }
  return Array.from(pids);
}

if (process.platform === "win32") {
  const pids = findListeningPidsWin([3000, 3001]);
  for (const pid of pids) {
    try {
      console.log(`[predev] Stopping existing Next.js process (PID ${pid}) on port 3000/3001...`);
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch {
      // Ignore if process already exited
    }
  }
}

await new Promise((resolve) => setTimeout(resolve, 300));
console.log("[predev] Ready to start Next.js.");
