import { createConfig, http, type Transport } from "wagmi";
import { injected } from "@wagmi/core";
import { chain, RPC_URL } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(RPC_URL) } as Record<typeof chain.id, Transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
