"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { TokenAvatar } from "@/components/TokenAvatar";
import { Progress } from "@/components/TokenCard";
import { TradePanel } from "@/components/TradePanel";
import { useHolders, useToken, useTrades, type Token } from "@/lib/api";
import { EXPLORER, GRADUATION, SUPPLY } from "@/lib/config";
import { fmtCompact, fmtEth, fmtPct, fmtPrice, fmtValue, shortAddr, timeAgo } from "@/lib/format";

function Copy({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(value).then(() => (setDone(true), setTimeout(() => setDone(false), 1200)))}
      className="rounded-lg border border-line px-2 py-1 font-mono text-xs text-muted hover:text-fg"
    >
      {done ? "copied" : label ?? shortAddr(value)}
    </button>
  );
}

function ext(url: string | null) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

function Header({ t }: { t: Token }) {
  const links = [
    ["Website", ext(t.website)],
    ["X", ext(t.x)],
    ["Telegram", ext(t.telegram)],
  ].filter(([, u]) => u) as [string, string][];
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <TokenAvatar src={t.image} symbol={t.symbol} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{t.name}</h1>
          <span className="font-mono text-sm text-muted">${t.symbol}</span>
          {t.graduated && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">GRADUATED</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Copy value={t.address} />
          <span>
            by{" "}
            <Link href={`/portfolio/?w=${t.creator}`} className="font-mono hover:text-accent">
              {shortAddr(t.creator)}
            </Link>
          </span>
          <span>· {timeAgo(t.createdAt)} ago</span>
          {links.map(([l, u]) => (
            <a key={l} href={u} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2 py-1 hover:text-fg">
              {l === "X" ? (
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-label="X">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              ) : (
                l
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stats({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const items: [string, string, string?][] = [
    ["Price", ethUsd > 0 ? `$${fmtPrice(t.priceUsd)}` : `${fmtPrice(t.priceEth)} ETH`],
    ["24h", fmtPct(t.change24h), t.change24h >= 0 ? "text-up" : "text-down"],
    ["FDV", fmtValue(t.fdvEth, ethUsd)],
    ["Liquidity", fmtValue(t.liquidityEth, ethUsd)],
    ["Vol 24h", fmtValue(t.volume24hEth, ethUsd)],
    ["Holders", String(t.holders)],
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map(([k, v, c]) => (
        <div key={k} className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-[11px] text-dim">{k}</p>
          <p className={`truncate font-mono text-sm ${c ?? ""}`}>{v}</p>
        </div>
      ))}
    </div>
  );
}

function Activity({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  const trades = useTrades(t.address);
  const holders = useHolders(t.address);
  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex gap-1 border-b border-line p-1.5">
        {(["trades", "holders"] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${tab === x ? "bg-panel-2" : "text-muted hover:text-fg"}`}>
            {x}
            {x === "holders" ? ` (${t.holders})` : ""}
          </button>
        ))}
      </div>
      <div className="max-h-[460px] overflow-auto">
        {tab === "trades" ? (
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-panel text-dim">
              <tr className="text-left">
                <th className="px-3 py-2 font-normal">Time</th>
                <th className="px-3 py-2 font-normal">Type</th>
                <th className="px-3 py-2 text-right font-normal">ETH</th>
                <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">{t.symbol}</th>
                <th className="px-3 py-2 text-right font-normal">Trader</th>
              </tr>
            </thead>
            <tbody>
              {trades.data?.trades.map((r) => (
                <tr key={r.id} className="border-t border-line/60">
                  <td className="px-3 py-2 text-dim">
                    {EXPLORER ? (
                      <a href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer" className="hover:text-fg">{timeAgo(r.ts)}</a>
                    ) : (
                      timeAgo(r.ts)
                    )}
                  </td>
                  <td className={`px-3 py-2 ${r.isBuy ? "text-up" : "text-down"}`}>{r.isBuy ? "buy" : "sell"}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtEth(r.eth).replace(" ETH", "")}
                    {ethUsd > 0 && <span className="hidden text-dim sm:inline"> · {fmtValue(r.eth, ethUsd)}</span>}
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">{fmtCompact(r.tokens)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/portfolio/?w=${r.trader}`} className={`hover:text-accent ${r.trader === t.creator ? "text-warn" : "text-muted"}`}>
                      {r.trader === t.creator ? "dev" : shortAddr(r.trader)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full font-mono text-xs">
            <tbody>
              {holders.data?.holders.map((h, i) => (
                <tr key={h.holder} className="border-t border-line/60 first:border-0">
                  <td className="w-8 px-3 py-2 text-dim">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/portfolio/?w=${h.holder}`} className="hover:text-accent">
                      {shortAddr(h.holder)}
                    </Link>
                    {h.label && <span className="ml-2 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">{h.label === "pool" ? "v4 pool" : h.label}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{fmtCompact(h.amount)}</td>
                  <td className="w-20 px-3 py-2 text-right text-muted">{fmtPct(h.pct, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(tab === "trades" ? trades.data?.trades.length : holders.data?.holders.length) === 0 && (
          <p className="py-10 text-center text-xs text-dim">Nothing yet</p>
        )}
      </div>
    </div>
  );
}

function Graduation({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const target = SUPPLY * GRADUATION;
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm">Graduation</p>
        <p className="font-mono text-sm text-accent">{fmtPct(t.graduationProgress, false)}</p>
      </div>
      <Progress value={t.graduationProgress} graduated={t.graduated} className="mt-2 h-2" />
      <p className="mt-2 text-xs leading-relaxed text-dim">
        {t.graduated
          ? "This token graduated: 73.86% of supply was bought out of the pool."
          : `${fmtCompact(t.netSold)} / ${fmtCompact(target)} tokens bought. Graduates when 73.86% of supply leaves the pool.`}
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-line pt-3 font-mono text-xs">
        <div className="flex justify-between"><dt className="text-dim">Pool ETH</dt><dd>{fmtEth(t.poolEth)}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Total volume</dt><dd>{fmtValue(t.volumeEth, ethUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Trades</dt><dd>{t.trades}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">Creator rewards</dt><dd>{t.creatorRewards ? "on (0.25%)" : "off"}</dd></div>
        <div className="flex justify-between"><dt className="text-dim">LP</dt><dd className="text-accent">locked forever</dd></div>
      </dl>
    </div>
  );
}

function TokenView() {
  const params = useSearchParams();
  const addr = params.get("a")?.toLowerCase();
  const { data, error, isLoading } = useToken(addr);
  if (!addr) return <p className="py-20 text-center text-sm text-muted">No token selected.</p>;
  if (isLoading || (!data && !error))
    return <p className="py-20 text-center text-sm text-muted">Loading token… freshly launched tokens show up within a few seconds.</p>;
  if (error || !data) return <p className="py-20 text-center text-sm text-down">Token not found.</p>;
  const t = data.token;
  return (
    <div className="space-y-4 py-6">
      <Header t={t} />
      <Stats t={t} ethUsd={data.ethUsd} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <PriceChart token={t.address} ethUsd={data.ethUsd} />
          <div className="lg:hidden">
            <TradePanel token={t} />
          </div>
          {t.description && <p className="rounded-2xl border border-line bg-panel p-4 text-sm leading-relaxed text-muted">{t.description}</p>}
          <Activity t={t} ethUsd={data.ethUsd} />
        </div>
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <TradePanel token={t} />
          </div>
          <Graduation t={t} ethUsd={data.ethUsd} />
        </div>
      </div>
    </div>
  );
}

export default function TokenPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Loading…</p>}>
      <TokenView />
    </Suspense>
  );
}
