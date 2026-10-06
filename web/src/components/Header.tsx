"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, chain } from "@/lib/config";
import { ConnectButton } from "./ConnectButton";

const NAV = [
  { href: "/", label: "Discover" },
  { href: "/launch/", label: "Launch" },
  { href: "/portfolio/", label: "Portfolio" },
  { href: "/docs/", label: "Docs" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 14" className={className} shapeRendering="crispEdges" aria-hidden>
      <path fill="#ccff00" d="M19 0h2v1h-2zM19 1h3v1h-3zM1 2h2v1h-2zM6 2h2v1h-2zM19 2h5v1h-5zM2 3h2v1h-2zM7 3h2v1h-2zM19 3h6v1h-6zM3 4h2v1h-2zM8 4h2v1h-2zM19 4h7v1h-7zM4 5h2v1h-2zM9 5h2v1h-2zM19 5h8v1h-8zM4 6h24v1h-24zM4 7h24v1h-24zM4 8h2v1h-2zM9 8h2v1h-2zM19 8h8v1h-8zM3 9h2v1h-2zM8 9h2v1h-2zM19 9h7v1h-7zM2 10h2v1h-2zM7 10h2v1h-2zM19 10h6v1h-6zM1 11h2v1h-2zM6 11h2v1h-2zM19 11h5v1h-5zM19 12h3v1h-3zM19 13h2v1h-2z" />
    </svg>
  );
}

export function Header() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, "")));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo className="h-[18px] w-[36px]" />
          <span className="text-[15px] font-semibold tracking-tight">{BRAND}</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] text-muted lg:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${chain.testnet ? "bg-warn" : "bg-accent"}`} />
            {chain.name}
          </span>
          <Link
            href="/launch/"
            className="hidden h-9 items-center rounded-lg border border-accent/40 px-3 text-sm font-medium text-accent hover:bg-accent/10 sm:flex"
          >
            + Launch
          </Link>
          <ConnectButton />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${active(n.href) ? "bg-panel-2 text-fg" : "text-muted"}`}
          >
            {n.label}
          </Link>
        ))}
        {chain.testnet && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 px-2 font-mono text-[11px] text-warn">testnet</span>
        )}
      </nav>
    </header>
  );
}
