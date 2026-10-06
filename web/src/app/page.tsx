"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TokenCard } from "@/components/TokenCard";
import { useStats, useTokens } from "@/lib/api";
import { BRAND, chain, DEPLOYED } from "@/lib/config";
import { fmtCompact, fmtValue } from "@/lib/format";

const TABS = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "top", label: "Top FDV" },
  { id: "near", label: "Near graduation" },
  { id: "graduated", label: "Graduated" },
];

export default function Home() {
  const [sort, setSort] = useState("trending");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  const { data, isLoading, error } = useTokens(sort, q);
  const { data: stats } = useStats();
  const ethUsd = data?.ethUsd ?? stats?.ethUsd ?? 0;

  return (
    <div>
      <section className="relative -mx-4 overflow-hidden px-4 pb-8 pt-10 sm:-mx-6 sm:px-6 sm:pt-14">
        <div className="grid-glow pointer-events-none absolute inset-0" />
        <div className="relative max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Uniswap v4 · {chain.name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Launch a token in one tx.
            <br />
            <span className="text-gradient">Liquidity from block one.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Every {BRAND} token gets a fixed supply, a v4 pool seeded with 100% of tokens, permanently locked liquidity and a
            3-second anti-snipe window. Creators earn 0.25% of every trade.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/launch/" className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:brightness-110">
              Launch a token
            </Link>
            <Link href="/docs/" className="rounded-xl border border-line-2 px-5 py-2.5 text-sm text-fg hover:bg-panel-2">
              How it works
            </Link>
          </div>
        </div>
        <div className="relative mt-8 grid max-w-xl grid-cols-3 gap-3 font-mono">
          {[
            ["Tokens", stats ? fmtCompact(stats.tokens, 0) : "–"],
            ["Volume", stats ? fmtValue(stats.volumeEth, stats.ethUsd) : "–"],
            ["Trades", stats ? fmtCompact(stats.trades, 1) : "–"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-panel/80 px-3 py-2.5">
              <p className="text-[11px] text-dim">{k}</p>
              <p className="text-sm sm:text-base">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {!DEPLOYED && (
        <p className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          Contracts aren&apos;t deployed on this network yet. Launching and trading open once they are.
        </p>
      )}

      <div className="sticky top-[97px] z-30 -mx-4 mb-4 flex flex-col gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:top-14 md:flex-row md:items-center">
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSort(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${sort === t.id ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search name, ticker or address"
          className="h-9 w-full rounded-lg border border-line bg-panel px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50 md:ml-auto md:w-72"
        />
      </div>

      {error && DEPLOYED ? (
        <p className="py-16 text-center text-sm text-down">Couldn&apos;t load tokens: {String((error as Error).message)}</p>
      ) : isLoading && DEPLOYED ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-line bg-panel" />
          ))}
        </div>
      ) : data && data.tokens.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.tokens.map((t) => (
            <TokenCard key={t.address} t={t} ethUsd={ethUsd} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-2 py-16 text-center">
          <p className="text-sm text-muted">{q ? "No tokens match that search." : "No tokens here yet."}</p>
          <Link href="/launch/" className="mt-3 inline-block text-sm text-accent hover:underline">
            Be the first to launch →
          </Link>
        </div>
      )}
    </div>
  );
}
