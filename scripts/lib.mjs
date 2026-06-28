import { existsSync, readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";

export function commandExists(command) {
  const check = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(check, args, { shell: process.platform !== "win32", stdio: "ignore" });
  return result.status === 0;
}

export function run(command, args = [], options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readEnv(path) {
  if (!existsSync(path)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) {
          return [line, ""];
        }
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

export function isSet(value) {
  return Boolean(value && !/^0x0{40}$/i.test(value) && value !== "change-me-local");
}

export function formatResult(ok, label, detail = "") {
  const marker = ok ? "PASS" : "FAIL";
  return `${marker} ${label}${detail ? ` - ${detail}` : ""}`;
}

export function pathWithBundledRuntime() {
  const bundledBin = "/Users/yitianwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin";
  const bundledNodeBin = "/Users/yitianwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin";
  const foundryBin = `${process.env.HOME ?? ""}/.foundry/bin`;
  const dockerDesktopBin = "/Applications/Docker.app/Contents/Resources/bin";
  return [bundledNodeBin, bundledBin, foundryBin, dockerDesktopBin, process.env.PATH].filter(Boolean).join(delimiter);
}
