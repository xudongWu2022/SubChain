"use client";

import { CalendarClock, CreditCard, Gauge, PlugZap, ReceiptText, Wallet } from "lucide-react";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useConnect, useDisconnect, useWriteContract } from "wagmi";
import { erc20Abi, mockUsdcAddress, subChainAbi, subChainAddress } from "@/lib/contracts";

const stats = [
  { label: "Monthly revenue", value: "$4,280", tone: "bg-mint" },
  { label: "Active subs", value: "428", tone: "bg-white" },
  { label: "Cancel rate", value: "3.8%", tone: "bg-white" },
  { label: "Due today", value: "19", tone: "bg-white" }
];

const payments = [
  { id: "INV-1008", customer: "0x8b2...81F", plan: "Pro Monthly", amount: 10, status: "Paid" },
  { id: "INV-1007", customer: "0x73a...9c2", plan: "Team Weekly", amount: 25, status: "Paid" },
  { id: "INV-1006", customer: "0xb19...C44", plan: "Pro Monthly", amount: 10, status: "Refunded" }
];

const subscriptions = [
  { plan: "Pro Monthly", merchant: "FigmaOps", next: "2026-07-26", amount: 10 },
  { plan: "Analytics Weekly", merchant: "DataNest", next: "2026-07-03", amount: 4 }
];

const zeroAddress = "0x0000000000000000000000000000000000000000";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Check your wallet and local chain.";
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync, isPending } = useWriteContract();
  const [status, setStatus] = useState({
    tone: "info" as "info" | "success" | "error",
    message: "Connect a browser wallet and deploy the local contracts before sending transactions."
  });

  const isConfigured = subChainAddress !== zeroAddress && mockUsdcAddress !== zeroAddress;
  const canSendTransaction = isConnected && isConfigured && !isPending;

  const connectWallet = async () => {
    const connector = connectors[0];

    if (!connector) {
      setStatus({
        tone: "error",
        message: "No injected wallet was found. Install or unlock MetaMask, then refresh this page."
      });
      return;
    }

    try {
      setStatus({ tone: "info", message: "Opening wallet connection..." });
      await connectAsync({ connector });
      setStatus({ tone: "success", message: "Wallet connected. You can now send transactions." });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error) });
    }
  };

  const runTransaction = async (label: string, action: () => Promise<unknown>) => {
    if (!isConnected) {
      setStatus({ tone: "error", message: "Connect your wallet first." });
      return;
    }

    if (!isConfigured) {
      setStatus({
        tone: "error",
        message: "Contract addresses are not configured. Set NEXT_PUBLIC_SUBCHAIN_ADDRESS and NEXT_PUBLIC_USDC_ADDRESS in apps/web/.env.local."
      });
      return;
    }

    try {
      setStatus({ tone: "info", message: `${label} transaction submitted. Confirm it in your wallet.` });
      const hash = await action();
      setStatus({ tone: "success", message: `${label} transaction sent: ${hash}` });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error) });
    }
  };

  const createPlan = () => {
    void runTransaction("Create plan", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        functionName: "createPlan",
        args: [mockUsdcAddress, parseUnits("10", 6), BigInt(30 * 24 * 60 * 60), BigInt(3 * 24 * 60 * 60), "ipfs://subchain/pro"]
      })
    );
  };

  const approveUsdc = () => {
    void runTransaction("Approve USDC", () =>
      writeContractAsync({
        address: mockUsdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [subChainAddress, parseUnits("100", 6)]
      })
    );
  };

  const subscribe = () => {
    void runTransaction("Subscribe", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        functionName: "subscribe",
        args: [BigInt(1)]
      })
    );
  };

  const charge = () => {
    void runTransaction("Charge subscription", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        functionName: "chargeSubscription",
        args: [BigInt(1)]
      })
    );
  };

  const cancel = () => {
    void runTransaction("Cancel subscription", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        functionName: "cancelSubscription",
        args: [BigInt(1)]
      })
    );
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-mint">
              <CreditCard size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">SubChain</h1>
              <p className="text-sm text-ink/60">Wallet-native recurring billing</p>
            </div>
          </div>
          {isConnected ? (
            <button
              className="rounded-md border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink hover:text-white"
              onClick={() => disconnect()}
            >
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
          ) : (
            <button
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-jade"
              disabled={isConnecting}
              onClick={connectWallet}
            >
              <Wallet size={16} />
              {isConnecting ? "Connecting..." : "Connect wallet"}
            </button>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Merchant command center</h2>
                <p className="text-sm text-ink/60">Revenue, retention, invoices, and keeper settlement in one surface.</p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!canSendTransaction}
                onClick={createPlan}
              >
                <PlugZap size={16} />
                Create $10 plan
              </button>
            </div>
            <div
              className={`mb-5 rounded-md border px-4 py-3 text-sm ${
                status.tone === "error"
                  ? "border-coral/40 bg-coral/10 text-ink"
                  : status.tone === "success"
                    ? "border-jade/30 bg-jade/10 text-ink"
                    : "border-ink/10 bg-paper text-ink/70"
              }`}
              role="status"
            >
              {status.message}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <div className={`rounded-md border border-ink/10 p-4 ${stat.tone}`} key={stat.label}>
                  <p className="text-xs font-medium uppercase text-ink/55">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <ReceiptText size={18} />
              <h2 className="font-semibold">Payment history</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-paper text-ink/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Invoice</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr className="border-t border-ink/10" key={payment.id}>
                      <td className="px-5 py-4 font-medium">{payment.id}</td>
                      <td className="px-5 py-4">{payment.customer}</td>
                      <td className="px-5 py-4">{payment.plan}</td>
                      <td className="px-5 py-4">{formatUnits(BigInt(payment.amount * 1_000_000), 6)} USDC</td>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-mint px-2 py-1 text-xs font-semibold">{payment.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-md border border-ink/10 bg-ink p-5 text-white">
            <div className="mb-5 flex items-center gap-2">
              <Gauge size={18} />
              <h2 className="font-semibold">Settlement controls</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <button className="rounded-md bg-white px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canSendTransaction} onClick={approveUsdc}>
                Approve 100 USDC
              </button>
              <button className="rounded-md bg-mint px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canSendTransaction} onClick={subscribe}>
                Subscribe to plan #1
              </button>
              <button className="rounded-md bg-jade px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canSendTransaction} onClick={charge}>
                Charge subscription #1
              </button>
              <button className="rounded-md border border-white/20 px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canSendTransaction} onClick={cancel}>
                Cancel subscription #1
              </button>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <CalendarClock size={18} />
              <h2 className="font-semibold">My subscriptions</h2>
            </div>
            <div className="divide-y divide-ink/10">
              {subscriptions.map((subscription) => (
                <div className="p-5" key={subscription.plan}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{subscription.plan}</p>
                      <p className="text-sm text-ink/60">{subscription.merchant}</p>
                    </div>
                    <p className="font-semibold">{subscription.amount} USDC</p>
                  </div>
                  <p className="mt-3 text-sm text-ink/60">Next charge: {subscription.next}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
