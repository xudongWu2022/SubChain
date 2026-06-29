#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { formatResult } from "./lib.mjs";

const requiredDocs = [
  "docs/ledgers/codex-execution-ledger.md",
  "docs/ledgers/validation-ledger.md",
  "docs/reference/launch-inputs.md",
  "docs/reference/api.md",
  "docs/reference/security-threat-model.md",
  "docs/reference/protocol-compatibility.md",
  "docs/reference/ops.md",
  "docs/runbooks/local-e2e.md",
  "docs/runbooks/testnet.md",
  "docs/runbooks/production.md"
];
const requiredRings = ["Ring 0", "Ring 1", "Ring 2", "Ring 3", "Ring 4", "Ring 5", "Ring 6", "Ring 7", "Ring 8", "Ring 9", "Ring 10"];

const results = requiredDocs.map((path) => ({ ok: existsSync(path), label: path }));
const ledgers = ["docs/ledgers/codex-execution-ledger.md", "docs/ledgers/validation-ledger.md"];

for (const ledger of ledgers) {
  const text = existsSync(ledger) ? readFileSync(ledger, "utf8") : "";
  for (const ring of requiredRings) {
    results.push({ ok: text.includes(ring), label: `${ledger} contains ${ring}` });
  }
}

for (const result of results) {
  console.log(formatResult(result.ok, result.label));
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`Documentation gate failed with ${failed.length} issue(s).`);
  process.exit(1);
}
