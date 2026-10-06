const SUB = "₀₁₂₃₄₅₆₇₈₉";

export function fmtCompact(n: number, digits = 2): string {
  if (!isFinite(n)) return "–";
  const a = Math.abs(n);
  for (const [v, s] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (a >= v) return (n / v).toFixed(digits).replace(/\.?0+$/, "") + s;
  }
  return a >= 1 ? n.toFixed(digits).replace(/\.?0+$/, "") : n.toPrecision(3).replace(/\.?0+$/, "");
}

export function fmtPrice(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.0001) return n.toPrecision(4).replace(/0+$/, "");
  const [m, e] = n.toExponential(3).split("e");
  const zeros = -Number(e) - 1;
  const digits = m.replace(".", "").replace(/0+$/, "");
  return `0.0${String(zeros).split("").map((d) => SUB[Number(d)]).join("")}${digits}`;
}

export function fmtUsd(n: number): string {
  if (!isFinite(n)) return "–";
  return n !== 0 && Math.abs(n) < 1 ? `$${fmtPrice(n)}` : `$${fmtCompact(n)}`;
}

export function fmtEth(n: number): string {
  if (!isFinite(n)) return "–";
  if (n === 0) return "0 ETH";
  return `${Math.abs(n) < 0.001 ? fmtPrice(n) : fmtCompact(n, 4)} ETH`;
}

/** USD if we have a price feed, otherwise ETH. */
export function fmtValue(eth: number, ethUsd: number): string {
  return ethUsd > 0 ? fmtUsd(eth * ethUsd) : fmtEth(eth);
}

export function fmtPct(n: number, signed = true): string {
  if (!isFinite(n)) return "–";
  const v = (n * 100).toFixed(Math.abs(n) >= 1 ? 0 : 2);
  return `${signed && n > 0 ? "+" : ""}${v}%`;
}

export function shortAddr(a?: string | null): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
