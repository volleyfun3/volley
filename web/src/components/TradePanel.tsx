"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatEther, maxUint256, parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { launchRouterAbi, launchTokenAbi } from "@/lib/abis";
import type { Token } from "@/lib/api";
import { ADDR, chain, DEPLOYED, SNIPE_TAX_BPS } from "@/lib/config";
import { fmtCompact, fmtEth } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function safeParse(v: string): bigint {
  try {
    return v && Number(v) > 0 ? parseEther(v as `${number}`) : 0n;
  } catch {
    return 0n;
  }
}

export function TradePanel({ token }: { token: Token }) {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: chain.id });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const eth = useBalance({ address, chainId: chain.id, query: { refetchInterval: 6000 } });
  const tokBal = useReadContract({
    address: token.address, abi: launchTokenAbi, functionName: "balanceOf", args: [address!], chainId: chain.id,
    query: { enabled: !!address, refetchInterval: 6000 },
  });
  const allowance = useReadContract({
    address: token.address, abi: launchTokenAbi, functionName: "allowance", args: [address!, ADDR.router], chainId: chain.id,
    query: { enabled: !!address },
  });

  const amountIn = safeParse(useDebounced(amount));
  const quote = useQuery({
    queryKey: ["quote", token.address, side, amountIn.toString()],
    enabled: amountIn > 0n && !!client && DEPLOYED,
    retry: false,
    refetchInterval: 8000,
    queryFn: async () => {
      const { result } = await client!.simulateContract({
        address: ADDR.router,
        abi: launchRouterAbi,
        functionName: side === "buy" ? "quoteBuy" : "quoteSell",
        args: [token.address, amountIn],
      });
      return { used: result[0], out: result[1] };
    },
  });

  const snipeLeft = token.createdAt + SNIPE_TAX_BPS.length - now;
  const snipeBps = snipeLeft > 0 ? SNIPE_TAX_BPS[SNIPE_TAX_BPS.length - snipeLeft] : 0;
  const feePct = (token.creatorRewards ? 1 : 0.75) + (side === "buy" ? snipeBps / 100 : 0);
  const balance = side === "buy" ? eth.data?.value ?? 0n : (tokBal.data as bigint | undefined) ?? 0n;
  const insufficient = !!address && amountIn > balance;
  const presets = side === "buy" ? ["0.01", "0.05", "0.1", "0.5"] : ["25", "50", "75", "100"];

  function preset(p: string) {
    setMsg(null);
    if (side === "buy") return setAmount(p);
    const bal = (tokBal.data as bigint | undefined) ?? 0n;
    setAmount(formatEther((bal * BigInt(p)) / 100n));
  }

  async function submit() {
    if (amountIn === 0n || busy) return;
    setMsg(null);
    try {
      setBusy("Connecting…");
      const account = await ensureWallet();
      const out = quote.data?.out ?? 0n;
      const minOut = (out * BigInt(Math.round((100 - slippage) * 100))) / 10_000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      if (side === "sell" && ((allowance.data as bigint | undefined) ?? 0n) < amountIn) {
        setBusy("Approve in wallet…");
        const h = await writeContractAsync({
          address: token.address, abi: launchTokenAbi, functionName: "approve", args: [ADDR.router, maxUint256], chainId: chain.id,
        });
        setBusy("Approving…");
        await confirm(h);
        await allowance.refetch();
      }
      setBusy("Confirm in wallet…");
      const hash =
        side === "buy"
          ? await writeContractAsync({
              address: ADDR.router, abi: launchRouterAbi, functionName: "buy",
              args: [token.address, minOut, account, deadline], value: amountIn, chainId: chain.id,
            })
          : await writeContractAsync({
              address: ADDR.router, abi: launchRouterAbi, functionName: "sell",
              args: [token.address, amountIn, minOut, account, deadline], chainId: chain.id,
            });
      setBusy(side === "buy" ? "Buying…" : "Selling…");
      await confirm(hash);
      setMsg({ ok: true, text: side === "buy" ? `Bought ${token.symbol}` : `Sold ${token.symbol}` });
      setAmount("");
      eth.refetch();
      tokBal.refetch();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  const outLabel = quote.data
    ? side === "buy"
      ? `${fmtCompact(Number(formatEther(quote.data.out)))} ${token.symbol}`
      : fmtEth(Number(formatEther(quote.data.out)))
    : quote.isFetching
      ? "…"
      : "–";

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setMsg(null);
            }}
            className={`h-9 rounded-lg text-sm font-semibold capitalize transition-colors ${
              side === s ? (s === "buy" ? "bg-up text-accent-ink" : "bg-down text-white") : "text-muted hover:text-fg"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-xs text-dim">
        <span>Amount</span>
        {address && (
          <button onClick={() => preset(side === "buy" ? formatEther(balance) : "100")} className="font-mono hover:text-fg">
            bal {side === "buy" ? fmtEth(Number(formatEther(balance))) : `${fmtCompact(Number(formatEther(balance)))} ${token.symbol}`}
          </button>
        )}
      </div>
      <div className="relative mt-1.5">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setMsg(null);
          }}
          placeholder="0.0"
          className="h-12 w-full rounded-xl border border-line bg-bg px-3 pr-20 font-mono text-lg outline-none focus:border-accent/50"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">{side === "buy" ? "ETH" : token.symbol}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {presets.map((p) => (
          <button key={p} onClick={() => preset(p)} className="rounded-lg border border-line py-1.5 font-mono text-xs text-muted hover:border-accent/40 hover:text-fg">
            {side === "buy" ? p : `${p}%`}
          </button>
        ))}
      </div>

      <dl className="mt-4 space-y-1.5 font-mono text-xs">
        <div className="flex justify-between"><dt className="text-dim">You receive</dt><dd>{outLabel}</dd></div>
        <div className="flex justify-between">
          <dt className="text-dim">Fee</dt>
          <dd className={snipeBps && side === "buy" ? "text-warn" : ""}>{feePct.toFixed(2)}%{snipeBps && side === "buy" ? " (anti-snipe)" : ""}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-dim">Max slippage</dt>
          <dd className="flex gap-1">
            {[1, 5, 10, 20].map((s) => (
              <button key={s} onClick={() => setSlippage(s)} className={`rounded px-1.5 ${slippage === s ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}>
                {s}%
              </button>
            ))}
          </dd>
        </div>
      </dl>

      <button
        onClick={submit}
        disabled={!DEPLOYED || amountIn === 0n || !!busy || insufficient || (quote.isError && !!address)}
        className={`mt-4 h-11 w-full rounded-xl text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${
          side === "buy" ? "bg-up text-accent-ink" : "bg-down text-white"
        }`}
      >
        {busy ??
          (!address
            ? "Connect wallet"
            : insufficient
              ? "Insufficient balance"
              : quote.isError
                ? "Amount too large for pool"
                : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`)}
      </button>
      {msg && <p className={`mt-3 break-words text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
    </div>
  );
}
