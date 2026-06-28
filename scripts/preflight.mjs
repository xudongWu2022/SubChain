#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readJson, commandExists, formatResult } from "./lib.mjs";

const allowMissingExternal = process.argv.includes("--allow-missing-external");
const rootPackage = readJson("package.json");
const workspacePackages = ["contracts/package.json", "apps/web/package.json", "apps/indexer/package.json", "apps/service-agent/package.json", "apps/agent/package.json"];
const requiredCommands = [
  { name: "npm", required: false },
  { name: "pnpm", required: false },
  { name: "forge", required: true },
  { name: "anvil", required: true },
  { name: "cast", required: true },
  { name: "docker", required: true }
];
const requiredScripts = ["preflight", "launch:check-secrets", "docs:gate", "validation:summary", "test:all", "deploy:testnet", "deploy:production"];
const requiredProtocolDeps = ["@x402/core", "@x402/express", "@x402/fetch", "@x402/evm", "@x402/svm", "@x402/mcp", "@modelcontextprotocol/sdk"];

const results = [];

results.push({ ok: Number(process.versions.node.split(".")[0]) >= 20, label: `Node ${process.version}`, detail: ">=20 required" });
results.push({ ok: requiredScripts.every((script) => rootPackage.scripts?.[script]), label: "root lifecycle scripts" });
results.push({ ok: workspacePackages.every((path) => existsSync(path)), label: "workspace package manifests" });

for (const command of requiredCommands) {
  const ok = commandExists(command.name);
  results.push({
    ok: ok || (!command.required && command.name === "npm" && commandExists("pnpm")),
    label: `${command.name} executable`,
    detail: ok ? "" : command.required ? "install or add to PATH" : "npm may be replaced by pnpm"
  });
}

const servicePackage = existsSync("apps/service-agent/package.json") ? readJson("apps/service-agent/package.json") : { dependencies: {} };
const allDeps = { ...rootPackage.dependencies, ...rootPackage.devDependencies, ...servicePackage.dependencies, ...servicePackage.devDependencies };
results.push({
  ok: requiredProtocolDeps.every((dep) => allDeps[dep]),
  label: "protocol adapter dependencies declared",
  detail: requiredProtocolDeps.filter((dep) => !allDeps[dep]).join(", ")
});

results.push({ ok: existsSync(".env.local.example"), label: ".env.local.example" });
results.push({ ok: existsSync(".env.testnet.example"), label: ".env.testnet.example" });
results.push({ ok: existsSync(".env.production.example"), label: ".env.production.example" });
results.push({ ok: existsSync("docker-compose.yml"), label: "docker compose file" });

for (const result of results) {
  console.log(formatResult(result.ok, result.label, result.detail));
}

const failed = results.filter((result) => !result.ok);
const externalFailures = failed.filter((result) => /forge|anvil|cast|docker|npm executable/.test(result.label));
const blockingFailures = allowMissingExternal ? failed.filter((result) => !externalFailures.includes(result)) : failed;

if (blockingFailures.length > 0) {
  console.error(`Preflight failed with ${blockingFailures.length} blocking issue(s).`);
  process.exit(1);
}

if (failed.length > 0) {
  console.warn(`Preflight has ${failed.length} external issue(s); launch rings that need them remain blocked.`);
}
