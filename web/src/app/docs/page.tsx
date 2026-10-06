import { ADDR, BRAND, chain, DEPLOYED, EXPLORER } from "@/lib/config";

const SECTIONS: [string, string][] = [
  [
    "Launching",
    "Pick a name, ticker and image and send one transaction. The factory mints exactly 1,000,000,000 tokens, opens a Uniswap v4 pool against ETH and puts the whole supply in it as single-sided liquidity. There is no mint function, no presale and no team allocation. If you set a first buy, it executes inside the same transaction, before anyone else can trade.",
  ],
  [
    "Locked liquidity",
    "The liquidity position is owned by the factory contract, which has no code path to remove it. Once a token launches, its pool can't be rugged.",
  ],
  [
    "Fees",
    "Every trade pays a 1% fee in ETH: 0.75% to the platform and 0.25% to the token creator. If the creator turns off rewards at launch, the fee is 0.75%. Creator fees accrue on-chain and can be claimed from the portfolio page at any time.",
  ],
  [
    "Anti-snipe",
    "Buys in the first three seconds after launch pay a decaying tax: 99% in the launch second, then 24.81%, then 5.19%, then just the normal fee. The creator's first buy in the launch transaction is exempt.",
  ],
  [
    "Graduation",
    "A token graduates once 73.86% of its supply has been bought out of the pool (net of sells). Trading keeps working exactly the same after graduation; the badge marks tokens with real demand.",
  ],
  [
    "Trading",
    "Trades go through a small router that swaps directly against the v4 PoolManager with slippage and deadline protection. Because the pools are standard v4 pools, any v4-aware aggregator can route to them too.",
  ],
];

export default function Docs() {
  const contracts: [string, string][] = [
    ["Factory", ADDR.factory],
    ["Hook", ADDR.hook],
    ["Router", ADDR.router],
    ["Uniswap v4 PoolManager", ADDR.poolManager],
  ];
  return (
    <div className="mx-auto max-w-3xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How {BRAND} works</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {BRAND} is a fair-launch token launchpad on {chain.name}, built on Uniswap v4 hooks.
      </p>
      <div className="mt-8 space-y-3">
        {SECTIONS.map(([h, p]) => (
          <section key={h} className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p}</p>
          </section>
        ))}
      </div>
      <h2 className="mt-10 font-semibold">Contracts · {chain.name}</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-panel">
        {contracts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 border-t border-line px-4 py-3 first:border-0 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted">{k}</span>
            {DEPLOYED || k.startsWith("Uniswap") ? (
              EXPLORER ? (
                <a href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className="break-all font-mono text-xs hover:text-accent">
                  {v}
                </a>
              ) : (
                <span className="break-all font-mono text-xs">{v}</span>
              )
            ) : (
              <span className="font-mono text-xs text-dim">not deployed yet</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-dim">
        Contracts are unaudited and running on testnet. Don&apos;t send real funds until an audit is done and mainnet contracts are published.
      </p>
    </div>
  );
}
