"use client";

import { CalendarClock, CreditCard, Gauge, PlugZap, ReceiptText, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useConnect, useDisconnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { foundry } from "wagmi/chains";
import { erc20Abi, mockUsdcAddress, subChainAbi, subChainAddress } from "@/lib/contracts";

const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const pollMs = 2_000;
const invoiceStatuses = ["Unpaid", "Paid", "Refunded", "Failed"];

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getEthereumProvider() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function parseChainId(chainId: unknown) {
  if (typeof chainId === "string") {
    return Number.parseInt(chainId, chainId.startsWith("0x") ? 16 : 10);
  }

  if (typeof chainId === "number") {
    return chainId;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Check your wallet and local chain.";
}

function shortAddress(address?: string) {
  if (!address) {
    return "-";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(value?: bigint) {
  return `${formatUnits(value ?? 0n, 6)} mUSDC`;
}

function formatUnixTime(value?: bigint) {
  if (!value || value === 0n) {
    return "-";
  }

  return new Date(Number(value) * 1000).toLocaleString();
}

function bigintFromInput(value: string, fallback: bigint) {
  if (!/^\d+$/.test(value)) {
    return fallback;
  }

  return BigInt(value);
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: foundry.id });
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<bigint>(0n);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<bigint>(0n);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<bigint>(0n);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [status, setStatus] = useState({
    tone: "info" as "info" | "success" | "error",
    message: "Connect a browser wallet and deploy the local contracts before sending transactions."
  });

  const isConfigured = subChainAddress !== zeroAddress && mockUsdcAddress !== zeroAddress;
  const activeChainId = walletChainId ?? chainId;
  const isLocalChain = activeChainId === foundry.id;
  const canSendTransaction = isConnected && isConfigured && isLocalChain && !isPending;

  const queryOptions = {
    enabled: isConfigured,
    refetchInterval: pollMs
  };

  const planCountQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "planCount",
    chainId: foundry.id,
    query: queryOptions
  });

  const subscriptionCountQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "subscriptionCount",
    chainId: foundry.id,
    query: queryOptions
  });

  const invoiceCountQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "invoiceCount",
    chainId: foundry.id,
    query: queryOptions
  });

  const planCount = planCountQuery.data ?? 0n;
  const subscriptionCount = subscriptionCountQuery.data ?? 0n;
  const invoiceCount = invoiceCountQuery.data ?? 0n;

  useEffect(() => {
    if (planCount > 0n && (selectedPlanId === 0n || selectedPlanId > planCount)) {
      setSelectedPlanId(planCount);
    }
  }, [planCount, selectedPlanId]);

  useEffect(() => {
    if (subscriptionCount > 0n && (selectedSubscriptionId === 0n || selectedSubscriptionId > subscriptionCount)) {
      setSelectedSubscriptionId(subscriptionCount);
    }
  }, [subscriptionCount, selectedSubscriptionId]);

  useEffect(() => {
    if (invoiceCount > 0n && (selectedInvoiceId === 0n || selectedInvoiceId > invoiceCount)) {
      setSelectedInvoiceId(invoiceCount);
    }
  }, [invoiceCount, selectedInvoiceId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const planQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "plans",
    args: [selectedPlanId],
    chainId: foundry.id,
    query: { enabled: isConfigured && selectedPlanId > 0n, refetchInterval: pollMs }
  });

  const subscriptionQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "subscriptions",
    args: [selectedSubscriptionId],
    chainId: foundry.id,
    query: { enabled: isConfigured && selectedSubscriptionId > 0n, refetchInterval: pollMs }
  });

  const invoiceQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "invoices",
    args: [selectedInvoiceId],
    chainId: foundry.id,
    query: { enabled: isConfigured && selectedInvoiceId > 0n, refetchInterval: pollMs }
  });

  const plan = planQuery.data;
  const subscription = subscriptionQuery.data;
  const invoice = invoiceQuery.data;
  const planMerchant = plan?.[0] as Address | undefined;
  const planToken = plan?.[1] as Address | undefined;
  const planAmount = plan?.[2] ?? 0n;
  const planInterval = plan?.[3] ?? 0n;
  const planGracePeriod = plan?.[4] ?? 0n;
  const planMetadataURI = plan?.[5] ?? "";
  const planActive = plan?.[6] ?? false;
  const subscriptionPlanId = subscription?.[0] ?? 0n;
  const subscriptionSubscriber = subscription?.[1] as Address | undefined;
  const subscriptionStartedAt = subscription?.[2] ?? 0n;
  const subscriptionPeriodStart = subscription?.[3] ?? 0n;
  const subscriptionNextChargeAt = subscription?.[4] ?? 0n;
  const subscriptionCanceled = subscription?.[5] ?? false;
  const invoiceSubscriptionId = invoice?.[0] ?? 0n;
  const invoicePlanId = invoice?.[1] ?? 0n;
  const invoiceSubscriber = invoice?.[2] as Address | undefined;
  const invoiceMerchant = invoice?.[3] as Address | undefined;
  const invoiceAmount = invoice?.[5] ?? 0n;
  const invoicePaidAt = invoice?.[7] ?? 0n;
  const invoiceStatus = invoice?.[8] ?? 0;
  const isDue = subscriptionNextChargeAt > 0n && BigInt(now) >= subscriptionNextChargeAt;
  const canCancelSubscription = Boolean(
    address && subscriptionSubscriber && address.toLowerCase() === subscriptionSubscriber.toLowerCase() && !subscriptionCanceled
  );

  const usdcBalanceQuery = useReadContract({
    address: mockUsdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: foundry.id,
    query: { enabled: isConfigured && Boolean(address), refetchInterval: pollMs }
  });

  const usdcAllowanceQuery = useReadContract({
    address: mockUsdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address ?? zeroAddress, subChainAddress],
    chainId: foundry.id,
    query: { enabled: isConfigured && Boolean(address), refetchInterval: pollMs }
  });

  const merchantBalanceQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "merchantBalances",
    args: [planMerchant ?? zeroAddress, mockUsdcAddress],
    chainId: foundry.id,
    query: { enabled: isConfigured && Boolean(planMerchant), refetchInterval: pollMs }
  });

  const usdcBalance = usdcBalanceQuery.data ?? 0n;
  const usdcAllowance = usdcAllowanceQuery.data ?? 0n;
  const merchantBalance = merchantBalanceQuery.data ?? 0n;
  const canApproveUsdc = canSendTransaction && Boolean(address);
  const canSubscribe = canSendTransaction && selectedPlanId > 0n && planActive && usdcAllowance >= planAmount;
  const canCharge = canSendTransaction && selectedSubscriptionId > 0n && !subscriptionCanceled && isDue;
  const canCancel = canSendTransaction && selectedSubscriptionId > 0n && canCancelSubscription;

  const stats = useMemo(
    () => [
      { label: "Plans", value: planCount.toString(), tone: "bg-mint" },
      { label: "Subscriptions", value: subscriptionCount.toString(), tone: "bg-white" },
      { label: "Invoices", value: invoiceCount.toString(), tone: "bg-white" },
      { label: "Merchant balance", value: formatTokenAmount(merchantBalance), tone: "bg-white" }
    ],
    [invoiceCount, merchantBalance, planCount, subscriptionCount]
  );

  const refreshWalletChainId = async () => {
    const provider = getEthereumProvider();

    if (!provider) {
      setWalletChainId(null);
      return null;
    }

    const nextChainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    setWalletChainId(nextChainId);
    return nextChainId;
  };

  const refetchChainState = async () => {
    await Promise.all([
      planCountQuery.refetch(),
      subscriptionCountQuery.refetch(),
      invoiceCountQuery.refetch(),
      planQuery.refetch(),
      subscriptionQuery.refetch(),
      invoiceQuery.refetch(),
      usdcBalanceQuery.refetch(),
      usdcAllowanceQuery.refetch(),
      merchantBalanceQuery.refetch()
    ]);
  };

  useEffect(() => {
    const provider = getEthereumProvider();

    if (!provider) {
      return;
    }

    void refreshWalletChainId();

    const handleChainChanged = (nextChainId: unknown) => {
      setWalletChainId(parseChainId(nextChainId));
    };

    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const switchToLocalChain = async () => {
    setStatus({ tone: "info", message: `Requesting MetaMask switch to Localhost 8545 / Chain ID ${foundry.id}...` });

    try {
      await switchChainAsync({ chainId: foundry.id });
    } catch {
      const provider = getEthereumProvider();

      if (!provider) {
        throw new Error("No injected wallet was found.");
      }

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x7a69" }]
        });
      } catch {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x7a69",
              chainName: "Localhost 8545",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["http://127.0.0.1:8545"]
            }
          ]
        });
      }
    }

    return refreshWalletChainId();
  };

  const connectWallet = async () => {
    if (!getEthereumProvider()) {
      setStatus({
        tone: "error",
        message: "No injected wallet was found. Install or unlock MetaMask, then refresh this page."
      });
      return;
    }

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
      await refreshWalletChainId();
      setStatus({ tone: "success", message: "Wallet connected. Live chain reads are enabled." });
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

    const currentWalletChainId = await refreshWalletChainId();

    if (currentWalletChainId !== foundry.id) {
      const switchedChainId = await switchToLocalChain();

      if (switchedChainId !== foundry.id) {
        setStatus({
          tone: "error",
          message: `Switch MetaMask to Localhost 8545 / Chain ID ${foundry.id}. Current wallet Chain ID: ${switchedChainId ?? currentWalletChainId ?? "unknown"}.`
        });
        return;
      }
    }

    try {
      setStatus({ tone: "info", message: `${label} submitted. Confirm it in MetaMask.` });
      const hash = await action();
      setStatus({ tone: "info", message: `${label} sent. Waiting for confirmation: ${hash}` });

      if (publicClient && typeof hash === "string") {
        await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      }

      await refetchChainState();
      setStatus({ tone: "success", message: `${label} confirmed. Chain data refreshed.` });
    } catch (error) {
      setStatus({ tone: "error", message: getErrorMessage(error) });
      await refetchChainState();
    }
  };

  const createPlan = () => {
    void runTransaction("Create plan", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
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
        chainId: foundry.id,
        functionName: "approve",
        args: [subChainAddress, parseUnits("100", 6)]
      })
    );
  };

  const subscribe = () => {
    void runTransaction(`Subscribe to plan #${selectedPlanId}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "subscribe",
        args: [selectedPlanId]
      })
    );
  };

  const charge = () => {
    void runTransaction(`Charge subscription #${selectedSubscriptionId}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "chargeSubscription",
        args: [selectedSubscriptionId]
      })
    );
  };

  const cancel = () => {
    void runTransaction(`Cancel subscription #${selectedSubscriptionId}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "cancelSubscription",
        args: [selectedSubscriptionId]
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
              <p className="text-sm text-ink/60">Live recurring billing state from Anvil</p>
            </div>
          </div>
          {isConnected ? (
            <button
              className="rounded-md border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink hover:text-white"
              onClick={() => disconnect()}
            >
              {shortAddress(address)}
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
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Merchant command center</h2>
                <p className="text-sm text-ink/60">Counts, balances, invoices, and selected IDs are read from the contract.</p>
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
              {isConnected && !isLocalChain && (
                <div className="mt-2 text-xs font-semibold text-coral">
                  Wrong network. Switch MetaMask to Localhost 8545 / Chain ID {foundry.id}.
                </div>
              )}
              {isConnected && (
                <div className="mt-2 break-all text-xs text-ink/70">
                  Connected wallet: {address} | Wallet Chain ID: {walletChainId ?? "unknown"} | App Chain ID: {chainId}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <div className={`rounded-md border border-ink/10 p-4 ${stat.tone}`} key={stat.label}>
                  <p className="text-xs font-medium uppercase text-ink/55">{stat.label}</p>
                  <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Gauge size={18} />
              <h2 className="font-semibold">Live contract selectors</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium">
                Plan ID
                <input
                  className="h-11 rounded-md border border-ink/15 px-3"
                  min="0"
                  max={planCount.toString()}
                  type="number"
                  value={selectedPlanId.toString()}
                  onChange={(event) => setSelectedPlanId(bigintFromInput(event.target.value, selectedPlanId))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Subscription ID
                <input
                  className="h-11 rounded-md border border-ink/15 px-3"
                  min="0"
                  max={subscriptionCount.toString()}
                  type="number"
                  value={selectedSubscriptionId.toString()}
                  onChange={(event) => setSelectedSubscriptionId(bigintFromInput(event.target.value, selectedSubscriptionId))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Invoice ID
                <input
                  className="h-11 rounded-md border border-ink/15 px-3"
                  min="0"
                  max={invoiceCount.toString()}
                  type="number"
                  value={selectedInvoiceId.toString()}
                  onChange={(event) => setSelectedInvoiceId(bigintFromInput(event.target.value, selectedInvoiceId))}
                />
              </label>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <ReceiptText size={18} />
              <h2 className="font-semibold">Latest invoice</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-paper text-ink/60">
                  <tr>
                    <th className="px-5 py-3 font-medium">Invoice</th>
                    <th className="px-5 py-3 font-medium">Subscription</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium">Subscriber</th>
                    <th className="px-5 py-3 font-medium">Merchant</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Paid at</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoiceId > 0n && invoice ? (
                    <tr className="border-t border-ink/10">
                      <td className="px-5 py-4 font-medium">#{selectedInvoiceId.toString()}</td>
                      <td className="px-5 py-4">#{invoiceSubscriptionId.toString()}</td>
                      <td className="px-5 py-4">#{invoicePlanId.toString()}</td>
                      <td className="px-5 py-4">{shortAddress(invoiceSubscriber)}</td>
                      <td className="px-5 py-4">{shortAddress(invoiceMerchant)}</td>
                      <td className="px-5 py-4">{formatTokenAmount(invoiceAmount)}</td>
                      <td className="px-5 py-4">{formatUnixTime(invoicePaidAt)}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-mint px-2 py-1 text-xs font-semibold">{invoiceStatuses[Number(invoiceStatus)] ?? "Unknown"}</span>
                      </td>
                    </tr>
                  ) : (
                    <tr className="border-t border-ink/10">
                      <td className="px-5 py-6 text-ink/55" colSpan={8}>
                        No invoices yet. Subscribe to an active plan to create the first paid invoice.
                      </td>
                    </tr>
                  )}
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
              <button className="rounded-md bg-white px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canApproveUsdc} onClick={approveUsdc}>
                Approve 100 mUSDC
              </button>
              <button className="rounded-md bg-mint px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canSubscribe} onClick={subscribe}>
                Subscribe to plan #{selectedPlanId.toString()}
              </button>
              <button className="rounded-md bg-jade px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canCharge} onClick={charge}>
                Charge subscription #{selectedSubscriptionId.toString()}
              </button>
              <button className="rounded-md border border-white/20 px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canCancel} onClick={cancel}>
                Cancel subscription #{selectedSubscriptionId.toString()}
              </button>
            </div>
            <div className="mt-5 grid gap-2 text-sm text-white/75">
              <p>Wallet balance: {formatTokenAmount(usdcBalance)}</p>
              <p>Allowance: {formatTokenAmount(usdcAllowance)}</p>
              <p>Charge due: {isDue ? "Yes" : "No"}</p>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <CreditCard size={18} />
              <h2 className="font-semibold">Selected plan</h2>
            </div>
            <div className="grid gap-3 p-5 text-sm">
              <p className="flex justify-between gap-3"><span className="text-ink/55">ID</span><span>#{selectedPlanId.toString()}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Merchant</span><span>{shortAddress(planMerchant)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Token</span><span>{shortAddress(planToken)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Amount</span><span>{formatTokenAmount(planAmount)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Interval</span><span>{planInterval.toString()} sec</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Grace</span><span>{planGracePeriod.toString()} sec</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Active</span><span>{planActive ? "Yes" : "No"}</span></p>
              <p className="break-all text-ink/55">Metadata: {planMetadataURI || "-"}</p>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-5 py-4">
              <CalendarClock size={18} />
              <h2 className="font-semibold">Selected subscription</h2>
            </div>
            <div className="grid gap-3 p-5 text-sm">
              <p className="flex justify-between gap-3"><span className="text-ink/55">ID</span><span>#{selectedSubscriptionId.toString()}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Plan</span><span>#{subscriptionPlanId.toString()}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Subscriber</span><span>{shortAddress(subscriptionSubscriber)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Started</span><span>{formatUnixTime(subscriptionStartedAt)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Period start</span><span>{formatUnixTime(subscriptionPeriodStart)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Next charge</span><span>{formatUnixTime(subscriptionNextChargeAt)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-ink/55">Canceled</span><span>{subscriptionCanceled ? "Yes" : "No"}</span></p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
