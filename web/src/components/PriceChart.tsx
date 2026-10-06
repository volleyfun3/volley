"use client";
import { CandlestickSeries, ColorType, createChart, HistogramSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useCandles } from "@/lib/api";
import { fmtPrice } from "@/lib/format";

const RES = [
  { s: 15, l: "15s" },
  { s: 60, l: "1m" },
  { s: 300, l: "5m" },
  { s: 900, l: "15m" },
  { s: 3600, l: "1h" },
  { s: 14400, l: "4h" },
];

export function PriceChart({ token, ethUsd }: { token: string; ethUsd: number }) {
  const [res, setRes] = useState(60);
  const [usd, setUsd] = useState(true);
  const showUsd = usd && ethUsd > 0;
  const { data } = useCandles(token, res);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fitted = useRef("");

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8f8f88", fontFamily: "var(--font-geist-mono)", attributionLogo: false },
      grid: { vertLines: { color: "#151515" }, horzLines: { color: "#151515" } },
      rightPriceScale: { borderColor: "#222222" },
      timeScale: { borderColor: "#222222", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#2e2e2e" }, horzLine: { color: "#2e2e2e" } },
    });
    candles.current = c.addSeries(CandlestickSeries, {
      upColor: "#2ee6a6", downColor: "#ff5c7a", borderVisible: false, wickUpColor: "#2ee6a6", wickDownColor: "#ff5c7a",
      priceFormat: { type: "custom", minMove: 1e-15, formatter: (p: number) => fmtPrice(p) },
    });
    volume.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#2ee6a633" });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => c.remove();
  }, []);

  useEffect(() => {
    if (!data || !candles.current || !volume.current) return;
    const k = showUsd ? ethUsd : 1;
    candles.current.setData(
      data.candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })),
    );
    volume.current.setData(
      data.candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume * k, color: c.close >= c.open ? "#2ee6a633" : "#ff5c7a33" })),
    );
    const key = `${token}:${res}:${showUsd}`;
    if (fitted.current !== key) {
      chart.current?.timeScale().fitContent();
      fitted.current = key;
    }
  }, [data, ethUsd, showUsd, res, token]);

  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        {RES.map((r) => (
          <button
            key={r.s}
            onClick={() => setRes(r.s)}
            className={`rounded-md px-2 py-1 font-mono text-xs ${res === r.s ? "bg-panel-2 text-fg" : "text-dim hover:text-fg"}`}
          >
            {r.l}
          </button>
        ))}
        {ethUsd > 0 && (
          <button onClick={() => setUsd((v) => !v)} className="ml-auto rounded-md px-2 py-1 font-mono text-xs text-muted hover:text-fg">
            {showUsd ? "USD" : "ETH"}
          </button>
        )}
      </div>
      <div ref={el} className="h-[300px] w-full sm:h-[400px]" />
    </div>
  );
}
