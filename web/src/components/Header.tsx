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
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#8b5cf6" />
      <path d="M8 9h3.5L16 19.6 20.5 9H24l-6.3 14h-3.4z" fill="#ffffff" />
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
          <Logo className="h-7 w-7" />
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
