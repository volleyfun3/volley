# Volley contracts

Foundry project for the Volley launchpad on Robinhood Chain (Uniswap v4).

- `LaunchToken.sol`: fixed-supply ERC-20, minted once at construction.
- `LaunchFactory.sol`: deploys the token, initializes the ETH/token v4 pool, seeds 100% of the supply as liquidity (no remove path) and runs the optional creator first buy.
- `LaunchHook.sol`: v4 hook for platform/creator fees, 3-second anti-snipe tax, graduation tracking and fee claims.
- `LaunchRouter.sol`: `buy`, `sell`, `quoteBuy`, `quoteSell` with slippage and deadline checks.

```bash
forge test                                   # forks Robinhood Chain testnet (FORK_RPC to override)
forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast --slow --private-key <key>
```

Deployed addresses are written to `deployments/<chainId>.json`.
