import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeAction, evaluatePolicy, type EconomicState } from "./decision.js";

function baseState(overrides: Partial<EconomicState> = {}): EconomicState {
  return {
    monthlyBudget: 5_000_000,
    committedRecurringSpend: 0,
    projectedUsage: 35,
    payPerUsePrice: 100_000,
    subscriptionPrice: 2_000_000,
    includedUnits: 30,
    lowUsageStreak: 0,
    activeSubscriptionId: null,
    ...overrides
  };
}

test("low projected usage chooses pay-per-use", () => {
  const proposal = proposeAction(baseState({ projectedUsage: 8 }));
  assert.equal(proposal.action, "pay_per_use");
  assert.equal(proposal.expectedCost, 800_000);
  assert.equal(proposal.requiresHitl, false);
});

test("high projected usage chooses subscribe and flags HITL at default threshold", () => {
  const proposal = proposeAction(baseState({ projectedUsage: 35 }));
  assert.equal(proposal.action, "subscribe");
  assert.equal(proposal.expectedCost, 2_000_000);
  assert.equal(proposal.requiresHitl, true); // 2_000_000 >= DEFAULT_HITL_THRESHOLD
});

test("two low-usage periods with an active subscription cancels", () => {
  const proposal = proposeAction(baseState({ lowUsageStreak: 2, activeSubscriptionId: "7" }));
  assert.equal(proposal.action, "cancel");
  assert.equal(proposal.targetId, "7");
});

test("kill switch stops everything", () => {
  const proposal = proposeAction(baseState({ projectedUsage: 35 }), { killSwitch: true });
  assert.equal(proposal.action, "stop");
});

test("policy blocks a subscribe that exceeds the monthly budget", () => {
  const state = baseState({ projectedUsage: 35, monthlyBudget: 1_000_000 });
  const proposal = proposeAction(state, { hitlThreshold: 10_000_000 }); // isolate the budget violation
  const policy = evaluatePolicy(state, proposal);
  assert.equal(proposal.action, "subscribe");
  assert.equal(policy.allowed, false);
  assert.ok(policy.violations.includes("monthly_budget_exceeded"));
});

test("policy blocks a duplicate subscription", () => {
  const state = baseState({ projectedUsage: 35, activeSubscriptionId: "1" });
  const proposal = proposeAction(state, { hitlThreshold: 10_000_000 });
  const policy = evaluatePolicy(state, proposal);
  assert.ok(policy.violations.includes("duplicate_subscription"));
});

test("a within-budget subscribe under the HITL threshold is allowed", () => {
  const state = baseState({ projectedUsage: 35 });
  const proposal = proposeAction(state, { hitlThreshold: 10_000_000 });
  const policy = evaluatePolicy(state, proposal);
  assert.equal(proposal.requiresHitl, false);
  assert.equal(policy.allowed, true);
});
