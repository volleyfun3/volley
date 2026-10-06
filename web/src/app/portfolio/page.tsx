"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { formatEther, isAddress } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { TokenAvatar } from "@/components/TokenAvatar";
import { launchHookAbi } from "@/lib/abis";
import { usePortfolio, type Token } from "@/lib/api";
import { ADDR, chain } from "@/lib/config";
import { fmtCompact, fmtEth, fmtValue, shortAddr, timeAgo } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

function ClaimRow({ t, ethUsd, own }: { t: Token; ethUsd: number; own: boolean }) {
  const accrued = useReadContract({
    address: ADDR.hook, abi: launchHookAbi, functionName: "creatorAccrued", args: [t.address], chainId: chain.id,
    query: { refetchInterval: 8000 },
  });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amount = Number(formatEther((accrued.data as bigint | undefined) ?? 0n));

  async function claim() {
    setErr(null);
    setBusy(true);
    try {
      await ensureWallet();
      const h = await writeContractAsync({ address: ADDR.hook, abi: launchHookAbi, functionName: "claimCreatorFees", args: [t.address], chainId: chain.id });
      await confirm(h);
      await accrued.refetch();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-0">
      <Link href={`/token/?a=${t.address}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TokenAvatar src={t.image} symbol={t.symbol} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm">{t.name}</p>
          <p className="font-mono text-xs text-dim">
            FDV {fmtValue(t.fdvEth, ethUsd)} · {timeAgo(t.createdAt)}
          </p>
        </div>
      </Link>
      <div className="text-right">
        <p className="font-mono text-sm">{t.creatorRewards ? fmtEth(amount) : "off"}</p>
        <p className="text-[11px] text-dim">claimable</p>
        {err && <p className="max-w-40 truncate text-[11px] text-down">{err}</p>}
      </div>
      {own && t.creatorRewards && (
        <button
          onClick={claim}
          disabled={busy || amount === 0}
          className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-ink disabled:opacity-40"
        >
          {busy ? "…" : "Claim"}
        </button>
      )}
    </div>
  );
}

function PortfolioView() {
  const params = useSearchParams();
  const { address } = useAccount();
  const viewing = params.get("w");
  const wallet = viewing && isAddress(viewing) ? viewing : address;
  const own = !!address && wallet?.toLowerCase() === address.toLowerCase();
  const { data, isLoading } = usePortfolio(wallet);

  if (!wallet)
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-sm text-muted">Connect a wallet to see your holdings, launches and creator fees.</p>
        <ConnectButton />
      </div>
    );

  const ethUsd = data?.ethUsd ?? 0;
  const total = data?.holdings.reduce((a, h) => a + h.valueEth, 0) ?? 0;

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-dim">{own ? "Your portfolio" : "Portfolio"}</p>
          <h1 className="font-mono text-xl sm:text-2xl">{shortAddr(wallet)}</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-dim">Holdings value</p>
          <p className="font-mono text-xl sm:text-2xl">{fmtValue(total, ethUsd)}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 text-sm">Holdings</h2>
        {isLoading ? (
          <p className="p-6 text-center text-xs text-dim">Loading…</p>
        ) : data?.holdings.length ? (
          data.holdings.map((h) => (
            <Link key={h.token.address} href={`/token/?a=${h.token.address}`} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-0 hover:bg-panel-2">
              <TokenAvatar src={h.token.image} symbol={h.token.symbol} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{h.token.name}</p>
                <p className="font-mono text-xs text-dim">
                  {fmtCompact(h.amount)} {h.token.symbol}
                </p>
              </div>
              <p className="font-mono text-sm">{fmtValue(h.valueEth, ethUsd)}</p>
            </Link>
          ))
        ) : (
          <p className="p-6 text-center text-xs text-dim">No holdings yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 text-sm">Launched tokens &amp; creator fees</h2>
        {data?.created.length ? (
          data.created.map((t) => <ClaimRow key={t.address} t={t} ethUsd={ethUsd} own={own} />)
        ) : (
          <p className="p-6 text-center text-xs text-dim">
            No launches yet.{" "}
            {own && (
              <Link href="/launch/" className="text-accent hover:underline">
                Launch one →
              </Link>
            )}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel">
        <h2 className="border-b border-line px-4 py-3 text-sm">Recent trades</h2>
        {data?.trades.length ? (
          <table className="w-full font-mono text-xs">
            <tbody>
              {data.trades.map((r) => (
                <tr key={r.id} className="border-t border-line/60 first:border-0">
                  <td className="px-4 py-2 text-dim">{timeAgo(r.ts)}</td>
                  <td className={`px-2 py-2 ${r.isBuy ? "text-up" : "text-down"}`}>{r.isBuy ? "buy" : "sell"}</td>
                  <td className="px-2 py-2">
                    <Link href={`/token/?a=${r.token}`} className="hover:text-accent">${r.symbol}</Link>
                  </td>
                  <td className="px-2 py-2 text-right">{fmtCompact(r.tokens)}</td>
                  <td className="px-4 py-2 text-right">{fmtEth(r.eth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-xs text-dim">No trades yet.</p>
        )}
      </section>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <PortfolioView />
    </Suspense>
  );
}
