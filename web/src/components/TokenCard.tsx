import Link from "next/link";
import type { Token } from "@/lib/api";
import { fmtPct, fmtValue, shortAddr, timeAgo } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";

export function Progress({ value, graduated, className = "" }: { value: number; graduated?: boolean; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`}>
      <div
        className={`h-full rounded-full ${graduated ? "bg-warn" : "bg-accent"}`}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function TokenCard({ t, ethUsd }: { t: Token; ethUsd: number }) {
  const up = t.change24h >= 0;
  return (
    <Link
      href={`/token/?a=${t.address}`}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/40 hover:bg-panel-2"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar src={t.image} symbol={t.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{t.name}</p>
            {t.graduated && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">GRAD</span>}
          </div>
          <p className="font-mono text-xs text-muted">
            ${t.symbol} · {shortAddr(t.creator)} · {timeAgo(t.createdAt)}
          </p>
        </div>
        <span className={`font-mono text-xs ${up ? "text-up" : "text-down"}`}>{fmtPct(t.change24h)}</span>
      </div>
      {t.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{t.description}</p>}
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div>
          <p className="text-dim">FDV</p>
          <p>{fmtValue(t.fdvEth, ethUsd)}</p>
        </div>
        <div>
          <p className="text-dim">Vol 24h</p>
          <p>{fmtValue(t.volume24hEth, ethUsd)}</p>
        </div>
        <div>
          <p className="text-dim">Holders</p>
          <p>{t.holders}</p>
        </div>
      </div>
      <div className="mt-auto">
        <div className="mb-1 flex justify-between font-mono text-[10px] text-dim">
          <span>{t.graduated ? "graduated" : "graduation"}</span>
          <span>{fmtPct(t.graduationProgress, false)}</span>
        </div>
        <Progress value={t.graduationProgress} graduated={t.graduated} />
      </div>
    </Link>
  );
}
