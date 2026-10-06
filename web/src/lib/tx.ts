"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAccount, useConnect, usePublicClient, useSwitchChain } from "wagmi";
import { chain } from "./config";

/** Connect + switch to the app chain if needed. Returns the account address. */
export function useEnsureWallet() {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  return useCallback(async () => {
    let addr = address;
    if (!isConnected || !addr) {
      const connector = connectors[0];
      if (!connector) throw new Error("No wallet found. Install MetaMask, Rabby or another browser wallet.");
      const res = await connectAsync({ connector, chainId: chain.id });
      addr = res.accounts[0];
    }
    if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
    return addr!;
  }, [address, chainId, isConnected, connectAsync, connectors, switchChainAsync]);
}

export function useConfirm() {
  const client = usePublicClient({ chainId: chain.id });
  const qc = useQueryClient();
  return useCallback(
    async (hash: `0x${string}`) => {
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setTimeout(() => qc.invalidateQueries(), 1500);
      return receipt;
    },
    [client, qc],
  );
}

export function errMsg(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const m = err?.shortMessage ?? err?.message ?? String(e);
  if (/user (rejected|denied)/i.test(m)) return "Transaction rejected in wallet";
  return m.split("\n")[0].slice(0, 160);
}
