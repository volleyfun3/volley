/* eslint-disable @next/next/no-img-element */
const PALETTE = ["#3cf0a0", "#5cc8ff", "#f5c451", "#ff8a5c", "#c58bff", "#ff5c9d"];

export function TokenAvatar({ src, symbol, size = 44, className = "" }: { src?: string | null; symbol: string; size?: number; className?: string }) {
  const color = PALETTE[[...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  const style = { width: size, height: size };
  if (src) return <img src={src} alt={symbol} style={style} className={`shrink-0 rounded-xl object-cover bg-panel-2 ${className}`} />;
  return (
    <div
      style={{ ...style, background: `${color}22`, color, fontSize: size * 0.36 }}
      className={`flex shrink-0 items-center justify-center rounded-xl font-mono font-semibold ${className}`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}
