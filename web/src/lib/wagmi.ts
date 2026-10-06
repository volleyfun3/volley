import { createConfig, http, type CreateConnectorFn, type Transport } from "wagmi";
import { injected } from "@wagmi/core";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { BRAND, chain, RPC_URL, WC_PROJECT_ID } from "./config";

const connectors: CreateConnectorFn[] = [injected()];
if (WC_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WC_PROJECT_ID,
      showQrModal: true,
      metadata: {
        name: BRAND,
        description: "Fair launches on Robinhood Chain",
        url: "https://volleyfun.org",
        icons: ["https://volleyfun.org/icon.png"],
      },
      qrModalOptions: { themeMode: "dark", themeVariables: { "--wcm-accent-color": "#CCFF00", "--wcm-z-index": "1000" } },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(RPC_URL) } as Record<typeof chain.id, Transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
