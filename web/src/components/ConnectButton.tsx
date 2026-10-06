"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/lib/config";
import { fmtEth, shortAddr } from "@/lib/format";
import { errMsg } from "@/lib/tx";

export function ConnectButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, chainId: chain.id, query: { refetchInterval: 8000 } });
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const base = "h-9 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap";
  if (!mounted) return <div className={`${base} w-28 bg-panel-2`} />;

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <div className="relative">
        <button
          className={`${base} bg-accent text-accent-ink hover:brightness-110 disabled:opacity-60`}
          disabled={isPending}
          onClick={() => injected && connect({ connector: injected, chainId: chain.id })}
        >
          {isPending ? "Connecting…" : "Connect"}
        </button>
        {error && (
          <p className="absolute right-0 top-11 z-50 w-64 rounded-lg border border-line bg-panel p-2 text-xs text-down">
            {/provider not found/i.test(error.message) ? "No browser wallet found. Install MetaMask or Rabby." : errMsg(error)}
          </p>
        )}
      </div>
    );
  }

  if (chainId !== chain.id) {
    return (
      <button className={`${base} bg-warn text-black`} onClick={() => switchChain({ chainId: chain.id })}>
        Switch network
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className={`${base} flex items-center gap-2 border border-line-2 bg-panel-2 hover:border-accent/50`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hidden font-mono text-xs text-muted sm:inline">{bal ? fmtEth(Number(bal.formatted)) : ""}</span>
        <span className="font-mono">{shortAddr(address)}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-line bg-panel p-1 shadow-2xl">
          <p className="px-3 py-2 font-mono text-xs text-muted sm:hidden">{bal ? fmtEth(Number(bal.formatted)) : ""}</p>
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2"
            onClick={() => navigator.clipboard.writeText(address!).then(() => setOpen(false))}
          >
            Copy address
          </button>
          <button
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-down hover:bg-panel-2"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
