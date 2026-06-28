"use client";

import { Activity, AlertTriangle, CheckCircle2, CircuitBoard, Database, FileText, Gauge, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type IndexerSummary = {
  configured: boolean;
  lastIndexedBlock: string | null;
  plans: Array<{ plan_id: string; merchant: string; price: string; active: boolean; service_id: string; included_units: string }>;
  subscriptions: Array<{ subscription_id: string; plan_id: string; owner: string; status: string; next_charge_at: string; used_units: string }>;
  invoices: Array<{ invoice_id: string; invoice_key: string; subscription_id: string; merchant: string; subscriber: string; amount: string; status: string }>;
  serviceUsage: Array<{ trace_id: string; owner: string; service_id: string; subscription_id: string | null; payment_identifier: string; units: string; source: string; success: boolean }>;
  agentActions: Array<{ cycle_id: string; action: string; target_id: string; expected_cost: string; expected_value: string; policy_result: unknown; execution_result: unknown }>;
  x402Payments: Array<{ payment_identifier: string; status: string; amount: string }>;
  error?: string;
};

const pollMs = 5_000;
const launchRings = [
  ["Ring 0", "Startup package", "implemented"],
  ["Ring 1", "Contract state machine", "implemented"],
  ["Ring 2", "Purpose-bound allowance", "implemented"],
  ["Ring 3", "Entitlement + feed", "implemented"],
  ["Ring 4", "x402 dual mode", "implemented"],
  ["Ring 5", "A2A + MCP", "implemented"],
  ["Ring 6", "Consumer agent", "implemented"],
  ["Ring 7", "Indexer/DB/Web", "implemented"],
  ["Ring 8", "Docker VPS + Ops", "config passed"],
  ["Ring 9", "Testnet total validation", "blocked inputs"],
  ["Ring 10", "Mainnet small pilot", "blocked inputs"]
];

function short(value?: string | null) {
  if (!value) {
    return "-";
  }
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatUnits(value?: string) {
  const units = BigInt(value ?? "0");
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""} USDC`;
}

export default function Home() {
  const [summary, setSummary] = useState<IndexerSummary | null>(null);
  const [agentResult, setAgentResult] = useState<string>("");

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const response = await fetch("/api/indexer/summary", { cache: "no-store" });
        const payload = (await response.json()) as IndexerSummary;
        if (!ignore) {
          setSummary(payload);
        }
      } catch {
        if (!ignore) {
          setSummary({
            configured: false,
            lastIndexedBlock: null,
            plans: [],
            subscriptions: [],
            invoices: [],
            serviceUsage: [],
            agentActions: [],
            x402Payments: [],
            error: "Summary API unavailable."
          });
        }
      }
    };

    void load();
    const timer = window.setInterval(load, pollMs);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: "Plans", value: summary?.plans.length ?? 0, icon: FileText },
      { label: "Subscriptions", value: summary?.subscriptions.length ?? 0, icon: ShieldCheck },
      { label: "Invoices", value: summary?.invoices.length ?? 0, icon: Database },
      { label: "Usage rows", value: summary?.serviceUsage.length ?? 0, icon: Activity }
    ],
    [summary]
  );

  const runAgentCycle = async () => {
    setAgentResult("Submitting local agent cycle...");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4022"}/cycle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: { projectedUsage: 35 } })
      });
      const payload = await response.json();
      setAgentResult(JSON.stringify(payload, null, 2));
    } catch (error) {
      setAgentResult(error instanceof Error ? error.message : "Agent cycle failed.");
    }
  };

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-mint">
              <CircuitBoard size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">SubChain Launch Console</h1>
              <p className="text-sm text-ink/60">Closed-loop subscription, x402, agent, and ops evidence</p>
            </div>
          </div>
          <span className={`rounded-md px-3 py-2 text-sm font-semibold ${summary?.configured ? "bg-mint text-ink" : "bg-coral text-white"}`}>
            {summary?.configured ? `Indexed ${summary.lastIndexedBlock ?? "-"}` : "DB gated"}
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8">
        {summary?.error ? (
          <div className="rounded-md border border-coral/30 bg-coral/10 p-4 text-sm text-ink">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} /> {summary.error}</div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div className="rounded-md border border-ink/10 bg-white p-4" key={stat.label}>
                <div className="flex items-center gap-2 text-sm font-semibold text-ink/60"><Icon size={16} /> {stat.label}</div>
                <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <Gauge size={18} />
              <h2 className="font-semibold">Execution Rings</h2>
            </div>
            <div className="grid divide-y divide-ink/10">
              {launchRings.map(([ring, label, status]) => (
                <div className="grid gap-2 px-5 py-4 sm:grid-cols-[90px_1fr_150px]" key={ring}>
                  <span className="text-sm font-semibold">{ring}</span>
                  <span className="text-sm text-ink/70">{label}</span>
                  <span className={`inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold ${
                    status === "implemented" || status === "config passed" ? "bg-mint text-ink" : status.includes("blocked") ? "bg-coral text-white" : "bg-paper text-ink"
                  }`}>
                    {status === "implemented" || status === "config passed" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-md border border-ink/10 bg-ink p-5 text-white">
            <h2 className="font-semibold">HITL / Agent Control</h2>
            <p className="mt-2 text-sm text-white/65">Run a local economic cycle. Mainnet execution remains gated by launch secrets and policy.</p>
            <button className="mt-4 rounded-md bg-mint px-4 py-3 text-sm font-semibold text-ink" onClick={runAgentCycle}>
              Run agent cycle
            </button>
            <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-xs text-white/75">
              {agentResult || "No cycle run yet."}
            </pre>
          </aside>
        </div>

        <DataSection title="Subscriptions" rows={summary?.subscriptions ?? []} render={(row) => (
          <>
            <td>#{row.subscription_id}</td><td>{short(row.owner)}</td><td>{row.status}</td><td>{row.used_units}</td><td>{row.next_charge_at}</td>
          </>
        )} headings={["ID", "Owner", "Status", "Used", "Next charge"]} />

        <DataSection title="Invoices" rows={summary?.invoices ?? []} render={(row) => (
          <>
            <td>#{row.invoice_id}</td><td>{short(row.invoice_key)}</td><td>{formatUnits(row.amount)}</td><td>{row.status}</td><td>{short(row.subscriber)}</td>
          </>
        )} headings={["ID", "Invoice key", "Amount", "Status", "Subscriber"]} />

        <DataSection title="Service Usage" rows={summary?.serviceUsage ?? []} render={(row) => (
          <>
            <td>{short(row.trace_id)}</td><td>{row.source}</td><td>{row.units}</td><td>{short(row.payment_identifier)}</td><td>{row.success ? "Yes" : "No"}</td>
          </>
        )} headings={["Trace", "Source", "Units", "Payment", "Success"]} />

        <DataSection title="Agent Actions" rows={summary?.agentActions ?? []} render={(row) => (
          <>
            <td>{short(row.cycle_id)}</td><td>{row.action}</td><td>{row.target_id}</td><td>{formatUnits(row.expected_cost)}</td><td>{formatUnits(row.expected_value)}</td>
          </>
        )} headings={["Cycle", "Action", "Target", "Cost", "Value"]} />
      </section>
    </main>
  );
}

function DataSection<T>({ title, rows, headings, render }: { title: string; rows: T[]; headings: string[]; render: (row: T) => ReactNode }) {
  return (
    <section className="rounded-md border border-ink/10 bg-white">
      <div className="border-b border-ink/10 px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-paper text-ink/60">
            <tr>{headings.map((heading) => <th className="px-5 py-3 font-medium" key={heading}>{heading}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr className="border-t border-ink/10 [&>td]:px-5 [&>td]:py-4" key={index}>{render(row)}</tr>
            )) : (
              <tr className="border-t border-ink/10"><td className="px-5 py-6 text-ink/55" colSpan={headings.length}>No records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
