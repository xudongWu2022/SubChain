#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const ledger = "docs/ledgers/validation-ledger.md";
if (!existsSync(ledger)) {
  console.error("Validation ledger is missing.");
  process.exit(1);
}

const text = readFileSync(ledger, "utf8");
const passCount = (text.match(/\bPASS\b/g) ?? []).length;
const blockedCount = (text.match(/\bBLOCKED\b/g) ?? []).length;
const failCount = (text.match(/\bFAIL\b/g) ?? []).length;

console.log(`Validation summary: PASS=${passCount} FAIL=${failCount} BLOCKED=${blockedCount}`);

if (failCount > 0) {
  process.exit(1);
}
