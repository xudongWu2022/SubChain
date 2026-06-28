export type ActionProposal = {
  action: "pay_per_use" | "subscribe" | "cancel" | "stop";
  targetId: string;
  expectedCost: number;
  expectedValue: number;
  rationale: string;
  confidence: number;
  requiresHitl: boolean;
};

export type EconomicState = {
  monthlyBudget: number;
  committedRecurringSpend: number;
  projectedUsage: number;
  payPerUsePrice: number;
  subscriptionPrice: number;
  includedUnits: number;
  lowUsageStreak: number;
  activeSubscriptionId: string | null;
};

export type DecisionOptions = {
  hitlThreshold?: number;
  killSwitch?: boolean;
};

export const DEFAULT_HITL_THRESHOLD = 2_000_000;

// Pure money-path decision logic, extracted so it can be unit-tested without
// starting the agent's HTTP server or touching the chain. See decision.test.ts.
export function proposeAction(state: EconomicState, options: DecisionOptions = {}): ActionProposal {
  const hitlThreshold = options.hitlThreshold ?? DEFAULT_HITL_THRESHOLD;

  if (options.killSwitch) {
    return {
      action: "stop",
      targetId: "kill-switch",
      expectedCost: 0,
      expectedValue: 0,
      rationale: "Kill switch is active.",
      confidence: 1,
      requiresHitl: false
    };
  }

  if (state.lowUsageStreak >= 2 && state.activeSubscriptionId) {
    return {
      action: "cancel",
      targetId: state.activeSubscriptionId,
      expectedCost: 0,
      expectedValue: state.payPerUsePrice * state.projectedUsage,
      rationale: "Two low-usage periods make pay-per-use preferable.",
      confidence: 0.82,
      requiresHitl: false
    };
  }

  const payPerUseCost = state.projectedUsage * state.payPerUsePrice;
  const subscriptionValue = Math.max(0, payPerUseCost - state.subscriptionPrice);
  const subscribe = state.projectedUsage > state.includedUnits || payPerUseCost > state.subscriptionPrice;
  const action = subscribe ? "subscribe" : "pay_per_use";
  const expectedCost = subscribe ? state.subscriptionPrice : payPerUseCost;

  return {
    action,
    targetId: "research-feed",
    expectedCost,
    expectedValue: subscribe ? subscriptionValue : payPerUseCost,
    rationale: subscribe
      ? `Projected ${state.projectedUsage} calls costs less through subscription.`
      : `Projected ${state.projectedUsage} calls is cheaper as pay-per-use.`,
    confidence: 0.86,
    requiresHitl: expectedCost >= hitlThreshold
  };
}

export function evaluatePolicy(state: EconomicState, proposal: ActionProposal) {
  const projectedSpend = state.committedRecurringSpend + proposal.expectedCost;
  const violations: string[] = [];
  if (projectedSpend > state.monthlyBudget) {
    violations.push("monthly_budget_exceeded");
  }
  if (proposal.action === "subscribe" && state.activeSubscriptionId) {
    violations.push("duplicate_subscription");
  }
  if (proposal.requiresHitl) {
    violations.push("hitl_required");
  }

  return {
    allowed: violations.length === 0,
    violations,
    projectedSpend
  };
}
