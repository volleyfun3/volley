"use client";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "./config";

export type Token = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  creator: `0x${string}`;
  poolId: string;
  metadataUri: string;
  description: string | null;
  image: string | null;
  website: string | null;
  x: string | null;
  telegram: string | null;
  creatorRewards: boolean;
  createdAt: number;
  launchBlock: number;
  launchTx: string;
  graduated: boolean;
  graduationProgress: number;
  netSold: number;
  burned: number;
  priceEth: number;
  priceUsd: number;
  fdvEth: number;
  fdvUsd: number;
  change24h: number;
  volume24hEth: number;
  volume24hUsd: number;
  volumeEth: number;
  liquidityEth: number;
  liquidityUsd: number;
  poolEth: number;
  holders: number;
  trades: number;
  lastTradeAt: number;
};

export type Trade = {
  id: string;
  trader: string;
  isBuy: boolean;
  eth: number;
  tokens: number;
  fee: number;
  priceEth: number;
  ts: number;
  tx: string;
  block: number;
};

export type Holder = { holder: string; amount: number; pct: number; label: "pool" | "burn" | "creator" | null };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Stats = { chainId: number; ethUsd: number; tokens: number; volumeEth: number; trades: number; head: number; cursor: number };
export type Portfolio = {
  holdings: { token: Token; amount: number; valueEth: number; valueUsd: number }[];
  created: Token[];
  trades: (Omit<Trade, "trader" | "fee" | "block"> & { token: string; symbol: string; name: string; image: string | null })[];
  ethUsd: number;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}

const live = { refetchInterval: 4000, staleTime: 2000 };

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats"), ...live });

export const useTokens = (sort: string, q = "") =>
  useQuery({
    queryKey: ["tokens", sort, q],
    queryFn: () => api<{ tokens: Token[]; ethUsd: number }>(`/tokens?sort=${sort}&q=${encodeURIComponent(q)}&limit=60`),
    ...live,
  });

export const useToken = (address?: string) =>
  useQuery({
    queryKey: ["token", address],
    queryFn: () => api<{ token: Token; ethUsd: number }>(`/tokens/${address}`),
    enabled: !!address,
    retry: (n, e) => n < 30 && /not found/.test(String(e)), // freshly launched token may not be indexed yet
    retryDelay: 1500,
    ...live,
  });

export const useTrades = (address?: string) =>
  useQuery({
    queryKey: ["trades", address],
    queryFn: () => api<{ trades: Trade[] }>(`/tokens/${address}/trades?limit=60`),
    enabled: !!address,
    ...live,
  });

export const useHolders = (address?: string) =>
  useQuery({
    queryKey: ["holders", address],
    queryFn: () => api<{ holders: Holder[] }>(`/tokens/${address}/holders`),
    enabled: !!address,
    ...live,
  });

export const useCandles = (address: string | undefined, res: number) =>
  useQuery({
    queryKey: ["candles", address, res],
    queryFn: () => api<{ candles: Candle[] }>(`/tokens/${address}/candles?res=${res}`),
    enabled: !!address,
    ...live,
  });

export const usePortfolio = (wallet?: string) =>
  useQuery({
    queryKey: ["portfolio", wallet?.toLowerCase()],
    queryFn: () => api<Portfolio>(`/portfolio/${wallet!.toLowerCase()}`),
    enabled: !!wallet,
    ...live,
  });

export async function uploadImage(file: File): Promise<string> {
  const { url } = await api<{ url: string }>("/upload", { method: "POST", headers: { "content-type": file.type }, body: file });
  return url;
}

export async function saveMetadata(meta: Record<string, string>): Promise<string> {
  const { uri } = await api<{ uri: string }>("/metadata", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta),
  });
  return uri;
}
