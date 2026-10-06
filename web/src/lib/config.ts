import { defineChain, type Address } from "viem";

const eth = { name: "Ether", symbol: "ETH", decimals: 18 } as const;

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

export const localChain = defineChain({
  id: 31337,
  name: "Local devnet",
  nativeCurrency: eth,
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 46630);
export const chain = [robinhoodTestnet, robinhoodMainnet, localChain].find((c) => c.id === chainId) ?? robinhoodTestnet;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER || chain.blockExplorers?.default.url || "").replace(/\/$/, "");
export const BRAND = process.env.NEXT_PUBLIC_BRAND || "hoodpad";

const zero = "0x0000000000000000000000000000000000000000";
export const ADDR = {
  factory: (process.env.NEXT_PUBLIC_FACTORY || zero) as Address,
  hook: (process.env.NEXT_PUBLIC_HOOK || zero) as Address,
  router: (process.env.NEXT_PUBLIC_ROUTER || zero) as Address,
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951" as Address,
};
export const DEPLOYED = ADDR.factory !== zero;

export const SUPPLY = 1_000_000_000;
export const GRADUATION = 0.7386;
export const FEES = { platformBps: 75, creatorBps: 25 };
export const SNIPE_TAX_BPS = [9900, 2481, 519];
