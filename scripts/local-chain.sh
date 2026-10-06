#!/usr/bin/env bash
# Seed a plain local anvil (chain 31337) with Robinhood testnet's Uniswap v4 PoolManager bytecode,
# deploy the launchpad, and write api/.dev.vars + web/.env.local for local development.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rpc="${LOCAL_RPC:-http://127.0.0.1:8545}"
pm=0x8366a39cc670b4001a1121b8f6a443a643e40951
key=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil dev account 0
cast=~/.foundry/bin/cast
forge=~/.foundry/bin/forge

mkdir -p "$root/.local"
[ -s "$root/.local/poolmanager.hex" ] ||
  $cast code $pm --rpc-url https://rpc.testnet.chain.robinhood.com > "$root/.local/poolmanager.hex"
$cast rpc anvil_setCode $pm "$(cat "$root/.local/poolmanager.hex")" --rpc-url "$rpc" > /dev/null

cd "$root/contracts"
mkdir -p deployments
$forge script script/Deploy.s.sol --rpc-url "$rpc" --broadcast --private-key $key > "$root/.local/deploy.log" 2>&1 ||
  { tail -20 "$root/.local/deploy.log"; exit 1; }
dep=deployments/31337.json
get() { python3 -c "import json,sys;print(json.load(open('$dep'))['$1'])"; }

cat > "$root/api/.dev.vars" <<VARS
RPC_URL=$rpc
CHAIN_ID=31337
FACTORY=$(get factory)
HOOK=$(get hook)
START_BLOCK=$(get startBlock)
VARS
cat > "$root/web/.env.local" <<VARS
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=$rpc
NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_FACTORY=$(get factory)
NEXT_PUBLIC_HOOK=$(get hook)
NEXT_PUBLIC_ROUTER=$(get router)
VARS
cat $dep
