"use client";

import { CalendarClock, CreditCard, Gauge, PlugZap, ReceiptText, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Address, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { foundry } from "wagmi/chains";
import { erc20Abi, mockUsdcAddress, subChainAbi, subChainAddress } from "@/lib/contracts";

const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const localFaucetAddress = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" as Address;
const pollMs = 2_000;
const invoiceStatuses = ["Unpaid", "Paid", "Refunded", "Failed"];
const localEthFaucetAmount = parseEther("10");
const localUsdcFaucetAmount = parseUnits("1000000", 6);
const listSize = 5;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type IndexerSummary = {
  configured: boolean;
  lastIndexedBlock: string | null;
  plans: Array<{ plan_id: string; merchant: string; amount: string; active: boolean; metadata_uri: string }>;
  subscriptions: Array<{ subscription_id: string; plan_id: string; subscriber: string; canceled: boolean; next_charge_at: string }>;
  invoices: Array<{ invoice_id: string; subscription_id: string; merchant: string; subscriber: string; amount: string; status: string }>;
  error?: string;
};

type PlanTuple = readonly [Address, Address, bigint, bigint, bigint, string, boolean];
type SubscriptionTuple = readonly [bigint, Address, bigint, bigint, bigint, boolean];
type InvoiceTuple = readonly [bigint, bigint, Address, Address, Address, bigint, bigint, bigint, number];

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
    const message = error.message;

    if (/user rejected|user denied|rejected the request/i.test(message)) {
      return "Transaction canceled in wallet.";
    }

    if (/insufficient funds/i.test(message)) {
      return "Insufficient ETH for gas. Use Fund wallet first.";
    }

    if (/Failed to fetch|NetworkError/i.test(message)) {
      return "Could not reach local Anvil RPC. Start it with npm run dev:local.";
    }

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

function formatEthAmount(value?: bigint) {
  return `${Number(formatUnits(value ?? 0n, 18)).toFixed(4)} ETH`;
}

function formatDays(seconds?: bigint) {
  if (!seconds || seconds === 0n) {
    return "-";
  }

  const days = Number(seconds) / 86_400;
  return `${Number.isInteger(days) ? days.toString() : days.toFixed(2)} days`;
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

function descendingIds(count: bigint, limit: number) {
  const ids: bigint[] = [];

  for (let id = count; id > 0n && ids.length < limit; id -= 1n) {
    ids.push(id);
  }

  return ids;
}

async function sendLocalRpcTransaction(transaction: Record<string, string>) {
  const response = await fetch(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_sendTransaction",
      params: [transaction]
    })
  });

  const payload = (await response.json()) as { result?: `0x${string}`; error?: { message?: string } };

  if (!response.ok || payload.error || !payload.result) {
    throw new Error(payload.error?.message ?? "Local Anvil transaction failed.");
  }

  return payload.result;
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
  const [planAmountInput, setPlanAmountInput] = useState("10");
  const [planIntervalDaysInput, setPlanIntervalDaysInput] = useState("30");
  const [planGraceDaysInput, setPlanGraceDaysInput] = useState("3");
  const [planMetadataInput, setPlanMetadataInput] = useState("ipfs://subchain/pro");
  const [isFundingLocalWallet, setIsFundingLocalWallet] = useState(false);
  const [indexerSummary, setIndexerSummary] = useState<IndexerSummary | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [status, setStatus] = useState({
    tone: "info" as "info" | "success" | "error",
    message: "Connect a browser wallet and deploy the local contracts before sending transactions."
  });

  const isConfigured = subChainAddress !== zeroAddress && mockUsdcAddress !== zeroAddress;
  const activeChainId = walletChainId ?? (isConnected ? null : chainId);
  const isLocalChain = activeChainId === foundry.id;
  const canUseLocalControls = isConnected && Boolean(address) && isConfigured && isLocalChain && !isPending && !isFundingLocalWallet;

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
  const recentPlanIds = useMemo(() => descendingIds(planCount, listSize), [planCount]);
  const recentSubscriptionIds = useMemo(() => descendingIds(subscriptionCount, listSize), [subscriptionCount]);
  const recentInvoiceIds = useMemo(() => descendingIds(invoiceCount, listSize), [invoiceCount]);

  const recentPlansQuery = useReadContracts({
    contracts: recentPlanIds.map((planId) => ({
      address: subChainAddress,
      abi: subChainAbi,
      functionName: "plans",
      args: [planId],
      chainId: foundry.id
    })),
    query: { enabled: isConfigured && recentPlanIds.length > 0, refetchInterval: pollMs }
  });

  const recentSubscriptionsQuery = useReadContracts({
    contracts: recentSubscriptionIds.map((subscriptionId) => ({
      address: subChainAddress,
      abi: subChainAbi,
      functionName: "subscriptions",
      args: [subscriptionId],
      chainId: foundry.id
    })),
    query: { enabled: isConfigured && recentSubscriptionIds.length > 0, refetchInterval: pollMs }
  });

  const recentInvoicesQuery = useReadContracts({
    contracts: recentInvoiceIds.map((invoiceId) => ({
      address: subChainAddress,
      abi: subChainAbi,
      functionName: "invoices",
      args: [invoiceId],
      chainId: foundry.id
    })),
    query: { enabled: isConfigured && recentInvoiceIds.length > 0, refetchInterval: pollMs }
  });

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

  useEffect(() => {
    let ignore = false;

    const loadIndexerSummary = async () => {
      try {
        const response = await fetch("/api/indexer/summary", { cache: "no-store" });
        const payload = (await response.json()) as IndexerSummary;

        if (!ignore) {
          setIndexerSummary(payload);
        }
      } catch {
        if (!ignore) {
          setIndexerSummary({
            configured: false,
            lastIndexedBlock: null,
            plans: [],
            subscriptions: [],
            invoices: [],
            error: "Indexer API is unavailable."
          });
        }
      }
    };

    void loadIndexerSummary();
    const timer = window.setInterval(loadIndexerSummary, 5_000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
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
  const invoiceToken = invoice?.[4] as Address | undefined;
  const invoiceAmount = invoice?.[5] ?? 0n;
  const invoicePaidAt = invoice?.[7] ?? 0n;
  const invoiceStatus = invoice?.[8] ?? 0;
  const isPlanMerchant = Boolean(address && planMerchant && address.toLowerCase() === planMerchant.toLowerCase());
  const isInvoiceMerchant = Boolean(address && invoiceMerchant && address.toLowerCase() === invoiceMerchant.toLowerCase());
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

  const ethBalanceQuery = useBalance({
    address,
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

  const invoiceMerchantBalanceQuery = useReadContract({
    address: subChainAddress,
    abi: subChainAbi,
    functionName: "merchantBalances",
    args: [invoiceMerchant ?? zeroAddress, invoiceToken ?? mockUsdcAddress],
    chainId: foundry.id,
    query: { enabled: isConfigured && Boolean(invoiceMerchant && invoiceToken), refetchInterval: pollMs }
  });

  const usdcBalance = usdcBalanceQuery.data ?? 0n;
  const usdcAllowance = usdcAllowanceQuery.data ?? 0n;
  const ethBalance = ethBalanceQuery.data?.value ?? 0n;
  const merchantBalance = merchantBalanceQuery.data ?? 0n;
  const invoiceMerchantBalance = invoiceMerchantBalanceQuery.data ?? 0n;
  const hasGas = ethBalance > 0n;
  const canFundLocalWallet = canUseLocalControls && Boolean(address);
  const canSendTransaction = canUseLocalControls && hasGas;
  const canApproveUsdc = canSendTransaction && Boolean(address);
  const canApprovePlanAmount = canSendTransaction && selectedPlanId > 0n && planAmount > 0n;
  const canSubscribe = canSendTransaction && selectedPlanId > 0n && planActive && usdcAllowance >= planAmount;
  const canCharge = canSendTransaction && selectedSubscriptionId > 0n && !subscriptionCanceled && isDue;
  const canCancel = canSendTransaction && selectedSubscriptionId > 0n && canCancelSubscription;
  const canTogglePlan = canSendTransaction && selectedPlanId > 0n && isPlanMerchant;
  const canRefundInvoice =
    canSendTransaction && selectedInvoiceId > 0n && isInvoiceMerchant && Number(invoiceStatus) === 1 && invoiceMerchantBalance >= invoiceAmount;
  const canWithdrawMerchantBalance = canSendTransaction && isPlanMerchant && merchantBalance > 0n;

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
      recentPlansQuery.refetch(),
      recentSubscriptionsQuery.refetch(),
      recentInvoicesQuery.refetch(),
      ethBalanceQuery.refetch(),
      usdcBalanceQuery.refetch(),
      usdcAllowanceQuery.refetch(),
      merchantBalanceQuery.refetch(),
      invoiceMerchantBalanceQuery.refetch()
    ]);
  };

  useEffect(() => {
    if (!isConnected || !address) {
      return;
    }

    let ignore = false;

    const syncConnectedWallet = async () => {
      try {
        await refreshWalletChainId();
        await refetchChainState();

        if (!ignore) {
          setStatus({ tone: "success", message: "Wallet connected. Live chain reads are enabled." });
        }
      } catch (error) {
        if (!ignore) {
          setStatus({ tone: "error", message: getErrorMessage(error) });
        }
      }
    };

    void syncConnectedWallet();

    return () => {
      ignore = true;
    };
  }, [address, isConnected, chainId]);

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
      const result = await connectAsync({ connector });
      setWalletChainId(result.chainId ?? null);
      setStatus({ tone: "info", message: "Wallet connected. Syncing live chain reads..." });
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

    if (!hasGas) {
      setStatus({ tone: "error", message: "No local ETH for gas. Click Fund wallet first." });
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
    let amount: bigint;

    try {
      amount = parseUnits(planAmountInput.trim(), 6);
    } catch {
      setStatus({ tone: "error", message: "Enter a valid mUSDC amount." });
      return;
    }

    const intervalDays = Number(planIntervalDaysInput);
    const graceDays = Number(planGraceDaysInput);

    if (amount <= 0n) {
      setStatus({ tone: "error", message: "Plan amount must be greater than 0." });
      return;
    }

    if (!Number.isFinite(intervalDays) || intervalDays < 1) {
      setStatus({ tone: "error", message: "Plan interval must be at least 1 day." });
      return;
    }

    if (!Number.isFinite(graceDays) || graceDays < 0) {
      setStatus({ tone: "error", message: "Grace period cannot be negative." });
      return;
    }

    const interval = BigInt(Math.floor(intervalDays * 24 * 60 * 60));
    const gracePeriod = BigInt(Math.floor(graceDays * 24 * 60 * 60));
    const metadataURI = planMetadataInput.trim();

    void runTransaction("Create plan", () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "createPlan",
        args: [mockUsdcAddress, amount, interval, gracePeriod, metadataURI]
      })
    );
  };

  const fundLocalWallet = () => {
    void (async () => {
      if (!isConnected || !address) {
        setStatus({ tone: "error", message: "Connect your wallet first." });
        return;
      }

      if (!isConfigured) {
        setStatus({
          tone: "error",
          message: "Contract addresses are not configured. Run npm run dev:local so the app can write apps/web/.env.local."
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

      setIsFundingLocalWallet(true);

      try {
        setStatus({ tone: "info", message: "Funding local wallet with 10 ETH..." });

        const ethHash = await sendLocalRpcTransaction({
          from: localFaucetAddress,
          to: address,
          value: `0x${localEthFaucetAmount.toString(16)}`
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: ethHash });
        }

        setStatus({ tone: "info", message: "Minting 1,000,000 mUSDC to your wallet..." });

        const usdcHash = await sendLocalRpcTransaction({
          from: localFaucetAddress,
          to: mockUsdcAddress,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "mint",
            args: [address, localUsdcFaucetAmount]
          })
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: usdcHash });
        }

        await refetchChainState();
        setStatus({ tone: "success", message: "Wallet funded with 10 ETH and 1,000,000 mUSDC." });
      } catch (error) {
        setStatus({ tone: "error", message: getErrorMessage(error) });
        await refetchChainState();
      } finally {
        setIsFundingLocalWallet(false);
      }
    })();
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

  const approveSelectedPlanAmount = () => {
    void runTransaction(`Approve ${formatTokenAmount(planAmount)}`, () =>
      writeContractAsync({
        address: mockUsdcAddress,
        abi: erc20Abi,
        chainId: foundry.id,
        functionName: "approve",
        args: [subChainAddress, planAmount]
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

  const setPlanActive = (active: boolean) => {
    void runTransaction(`${active ? "Activate" : "Deactivate"} plan #${selectedPlanId}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "setPlanActive",
        args: [selectedPlanId, active]
      })
    );
  };

  const refundInvoice = () => {
    void runTransaction(`Refund invoice #${selectedInvoiceId}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "refundInvoice",
        args: [selectedInvoiceId]
      })
    );
  };

  const withdrawMerchantBalance = () => {
    void runTransaction(`Withdraw ${formatTokenAmount(merchantBalance)}`, () =>
      writeContractAsync({
        address: subChainAddress,
        abi: subChainAbi,
        chainId: foundry.id,
        functionName: "withdraw",
        args: [planToken ?? mockUsdcAddress, merchantBalance]
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
            </div>
            <div
              className={`mb-5 rounded-md border px-4 py-3 text-sm break-words ${
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
              {isConnected && isLocalChain && !hasGas && (
                <div className="mt-2 text-xs font-semibold text-coral">
                  No local ETH for gas. Use Fund wallet before creating plans or sending transactions.
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
            <form
              className="mt-5 grid gap-4 border-t border-ink/10 pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                createPlan();
              }}
            >
              <div className="flex items-center gap-2">
                <PlugZap size={18} />
                <h3 className="font-semibold">Create plan</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <label className="grid gap-2 text-sm font-medium">
                  Amount
                  <div className="flex h-11 overflow-hidden rounded-md border border-ink/15 bg-white">
                    <input
                      className="min-w-0 flex-1 px-3 outline-none"
                      inputMode="decimal"
                      value={planAmountInput}
                      onChange={(event) => setPlanAmountInput(event.target.value)}
                    />
                    <span className="flex items-center border-l border-ink/10 px-3 text-xs font-semibold text-ink/55">mUSDC</span>
                  </div>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Interval
                  <div className="flex h-11 overflow-hidden rounded-md border border-ink/15 bg-white">
                    <input
                      className="min-w-0 flex-1 px-3 outline-none"
                      inputMode="decimal"
                      value={planIntervalDaysInput}
                      onChange={(event) => setPlanIntervalDaysInput(event.target.value)}
                    />
                    <span className="flex items-center border-l border-ink/10 px-3 text-xs font-semibold text-ink/55">days</span>
                  </div>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Grace
                  <div className="flex h-11 overflow-hidden rounded-md border border-ink/15 bg-white">
                    <input
                      className="min-w-0 flex-1 px-3 outline-none"
                      inputMode="decimal"
                      value={planGraceDaysInput}
                      onChange={(event) => setPlanGraceDaysInput(event.target.value)}
                    />
                    <span className="flex items-center border-l border-ink/10 px-3 text-xs font-semibold text-ink/55">days</span>
                  </div>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Metadata URI
                  <input
                    className="h-11 rounded-md border border-ink/15 px-3"
                    value={planMetadataInput}
                    onChange={(event) => setPlanMetadataInput(event.target.value)}
                  />
                </label>
              </div>
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-coral px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit"
                disabled={!canSendTransaction}
                type="submit"
              >
                <PlugZap size={16} />
                Create plan
              </button>
            </form>
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

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-md border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-5 py-4">
                <h2 className="font-semibold">Recent plans</h2>
              </div>
              <div className="grid divide-y divide-ink/10">
                {recentPlanIds.length > 0 ? (
                  recentPlanIds.map((planId, index) => {
                    const row = recentPlansQuery.data?.[index];
                    const planRow = row?.status === "success" ? (row.result as unknown as PlanTuple) : undefined;
                    const amount = planRow?.[2] ?? 0n;
                    const interval = planRow?.[3] ?? 0n;
                    const active = planRow?.[6] ?? false;

                    return (
                      <button
                        className={`grid gap-1 px-5 py-4 text-left text-sm hover:bg-paper ${selectedPlanId === planId ? "bg-mint/40" : ""}`}
                        key={planId.toString()}
                        onClick={() => setSelectedPlanId(planId)}
                        type="button"
                      >
                        <span className="font-semibold">Plan #{planId.toString()}</span>
                        <span className="text-ink/60">{formatTokenAmount(amount)} / {formatDays(interval)}</span>
                        <span className="text-xs font-semibold text-ink/50">{active ? "Active" : "Inactive"}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-5 py-6 text-sm text-ink/55">No plans yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-5 py-4">
                <h2 className="font-semibold">Recent subscriptions</h2>
              </div>
              <div className="grid divide-y divide-ink/10">
                {recentSubscriptionIds.length > 0 ? (
                  recentSubscriptionIds.map((subscriptionId, index) => {
                    const row = recentSubscriptionsQuery.data?.[index];
                    const subscriptionRow = row?.status === "success" ? (row.result as unknown as SubscriptionTuple) : undefined;
                    const rowPlanId = subscriptionRow?.[0] ?? 0n;
                    const rowSubscriber = subscriptionRow?.[1] as Address | undefined;
                    const nextChargeAt = subscriptionRow?.[4] ?? 0n;
                    const canceled = subscriptionRow?.[5] ?? false;

                    return (
                      <button
                        className={`grid gap-1 px-5 py-4 text-left text-sm hover:bg-paper ${selectedSubscriptionId === subscriptionId ? "bg-mint/40" : ""}`}
                        key={subscriptionId.toString()}
                        onClick={() => {
                          setSelectedSubscriptionId(subscriptionId);
                          if (rowPlanId > 0n) {
                            setSelectedPlanId(rowPlanId);
                          }
                        }}
                        type="button"
                      >
                        <span className="font-semibold">Subscription #{subscriptionId.toString()}</span>
                        <span className="text-ink/60">Plan #{rowPlanId.toString()} · {shortAddress(rowSubscriber)}</span>
                        <span className="text-xs font-semibold text-ink/50">{canceled ? "Canceled" : `Next ${formatUnixTime(nextChargeAt)}`}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-5 py-6 text-sm text-ink/55">No subscriptions yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-5 py-4">
                <h2 className="font-semibold">Recent invoices</h2>
              </div>
              <div className="grid divide-y divide-ink/10">
                {recentInvoiceIds.length > 0 ? (
                  recentInvoiceIds.map((invoiceId, index) => {
                    const row = recentInvoicesQuery.data?.[index];
                    const invoiceRow = row?.status === "success" ? (row.result as unknown as InvoiceTuple) : undefined;
                    const rowSubscriptionId = invoiceRow?.[0] ?? 0n;
                    const rowPlanId = invoiceRow?.[1] ?? 0n;
                    const amount = invoiceRow?.[5] ?? 0n;
                    const statusIndex = Number(invoiceRow?.[8] ?? 0);

                    return (
                      <button
                        className={`grid gap-1 px-5 py-4 text-left text-sm hover:bg-paper ${selectedInvoiceId === invoiceId ? "bg-mint/40" : ""}`}
                        key={invoiceId.toString()}
                        onClick={() => {
                          setSelectedInvoiceId(invoiceId);
                          if (rowSubscriptionId > 0n) {
                            setSelectedSubscriptionId(rowSubscriptionId);
                          }
                          if (rowPlanId > 0n) {
                            setSelectedPlanId(rowPlanId);
                          }
                        }}
                        type="button"
                      >
                        <span className="font-semibold">Invoice #{invoiceId.toString()}</span>
                        <span className="text-ink/60">{formatTokenAmount(amount)} · Subscription #{rowSubscriptionId.toString()}</span>
                        <span className="text-xs font-semibold text-ink/50">{invoiceStatuses[statusIndex] ?? "Unknown"}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-5 py-6 text-sm text-ink/55">No invoices yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-ink/10 bg-white">
            <div className="flex flex-col gap-1 border-b border-ink/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-semibold">Indexer feed</h2>
              <span className={`text-xs font-semibold ${indexerSummary?.configured ? "text-jade" : "text-ink/45"}`}>
                {indexerSummary?.configured ? `Indexed block ${indexerSummary.lastIndexedBlock ?? "-"}` : "DATABASE_URL not configured"}
              </span>
            </div>
            {indexerSummary?.error ? (
              <p className="px-5 py-4 text-sm text-coral">{indexerSummary.error}</p>
            ) : null}
            <div className="grid gap-0 divide-y divide-ink/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              <div className="p-5">
                <h3 className="mb-3 text-sm font-semibold">DB plans</h3>
                <div className="grid gap-3 text-sm">
                  {indexerSummary?.plans.length ? (
                    indexerSummary.plans.map((dbPlan) => (
                      <button
                        className="rounded-md border border-ink/10 p-3 text-left hover:bg-paper"
                        key={dbPlan.plan_id}
                        onClick={() => setSelectedPlanId(BigInt(dbPlan.plan_id))}
                        type="button"
                      >
                        <span className="font-semibold">Plan #{dbPlan.plan_id}</span>
                        <span className="mt-1 block text-ink/60">{formatTokenAmount(BigInt(dbPlan.amount))} · {dbPlan.active ? "Active" : "Inactive"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-ink/55">No indexed plans.</p>
                  )}
                </div>
              </div>
              <div className="p-5">
                <h3 className="mb-3 text-sm font-semibold">DB subscriptions</h3>
                <div className="grid gap-3 text-sm">
                  {indexerSummary?.subscriptions.length ? (
                    indexerSummary.subscriptions.map((dbSubscription) => (
                      <button
                        className="rounded-md border border-ink/10 p-3 text-left hover:bg-paper"
                        key={dbSubscription.subscription_id}
                        onClick={() => {
                          setSelectedSubscriptionId(BigInt(dbSubscription.subscription_id));
                          setSelectedPlanId(BigInt(dbSubscription.plan_id));
                        }}
                        type="button"
                      >
                        <span className="font-semibold">Subscription #{dbSubscription.subscription_id}</span>
                        <span className="mt-1 block text-ink/60">Plan #{dbSubscription.plan_id} · {shortAddress(dbSubscription.subscriber)}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-ink/55">No indexed subscriptions.</p>
                  )}
                </div>
              </div>
              <div className="p-5">
                <h3 className="mb-3 text-sm font-semibold">DB invoices</h3>
                <div className="grid gap-3 text-sm">
                  {indexerSummary?.invoices.length ? (
                    indexerSummary.invoices.map((dbInvoice) => (
                      <button
                        className="rounded-md border border-ink/10 p-3 text-left hover:bg-paper"
                        key={dbInvoice.invoice_id}
                        onClick={() => {
                          setSelectedInvoiceId(BigInt(dbInvoice.invoice_id));
                          setSelectedSubscriptionId(BigInt(dbInvoice.subscription_id));
                        }}
                        type="button"
                      >
                        <span className="font-semibold">Invoice #{dbInvoice.invoice_id}</span>
                        <span className="mt-1 block text-ink/60">{formatTokenAmount(BigInt(dbInvoice.amount))} · {dbInvoice.status}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-ink/55">No indexed invoices.</p>
                  )}
                </div>
              </div>
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
              <button className="rounded-md bg-mint px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canFundLocalWallet} onClick={fundLocalWallet}>
                {isFundingLocalWallet ? "Funding wallet..." : "Fund wallet: 10 ETH + 1,000,000 mUSDC"}
              </button>
              <button className="rounded-md bg-white px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canApproveUsdc} onClick={approveUsdc}>
                Approve 100 mUSDC
              </button>
              <button className="rounded-md bg-white px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canApprovePlanAmount} onClick={approveSelectedPlanAmount}>
                Approve selected plan amount
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
              <button className="rounded-md border border-white/20 px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canTogglePlan} onClick={() => setPlanActive(!planActive)}>
                {planActive ? "Deactivate" : "Activate"} plan #{selectedPlanId.toString()}
              </button>
              <button className="rounded-md bg-coral px-4 py-3 text-left font-semibold text-white disabled:opacity-60" disabled={!canRefundInvoice} onClick={refundInvoice}>
                Refund invoice #{selectedInvoiceId.toString()}
              </button>
              <button className="rounded-md bg-white px-4 py-3 text-left font-semibold text-ink disabled:opacity-60" disabled={!canWithdrawMerchantBalance} onClick={withdrawMerchantBalance}>
                Withdraw {formatTokenAmount(merchantBalance)}
              </button>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 p-3">
                  <p className="text-xs font-semibold uppercase text-white/45">ETH</p>
                  <p className="mt-1 font-semibold text-white">{formatEthAmount(ethBalance)}</p>
                </div>
                <div className="rounded-md border border-white/10 p-3">
                  <p className="text-xs font-semibold uppercase text-white/45">mUSDC</p>
                  <p className="mt-1 font-semibold text-white">{formatTokenAmount(usdcBalance)}</p>
                </div>
              </div>
              <div className="rounded-md border border-white/10 p-3 text-white/75">
                <div className="flex justify-between gap-3">
                  <span>Selected plan cost</span>
                  <span className="font-semibold text-white">{formatTokenAmount(planAmount)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span>Allowance</span>
                  <span className="font-semibold text-white">{formatTokenAmount(usdcAllowance)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span>Subscription ready</span>
                  <span className="font-semibold text-white">{canSubscribe ? "Yes" : "No"}</span>
                </div>
              </div>
              <div className="grid gap-2 text-white/75">
                <p>Charge due: {isDue ? "Yes" : "No"}</p>
                <p>Selected plan merchant: {isPlanMerchant ? "Yes" : "No"}</p>
                <p>Selected invoice token: {shortAddress(invoiceToken)}</p>
              </div>
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
