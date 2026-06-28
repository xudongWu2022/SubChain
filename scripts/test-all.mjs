#!/usr/bin/env node
import { commandExists, pathWithBundledRuntime, run } from "./lib.mjs";

const env = { ...process.env, PATH: pathWithBundledRuntime() };
const checks = [
  ["node", ["scripts/preflight.mjs", "--allow-missing-external"]],
  ["node", ["scripts/protocol-canary.mjs"]],
  ["node", ["scripts/docs-gate.mjs"]],
  ["node", ["scripts/validation-summary.mjs"]]
];

if (commandExists("forge")) {
  checks.push(["forge", ["test", "-vvv"], { cwd: "contracts" }]);
} else {
  console.warn("SKIP forge test - forge is not available; recorded as external preflight blocker.");
}

let failed = 0;
for (const [command, args, options] of checks) {
  const result = run(command, args, { env, ...(options ?? {}) });
  if (result.status !== 0) {
    failed += 1;
  }
}

process.exit(failed === 0 ? 0 : 1);
