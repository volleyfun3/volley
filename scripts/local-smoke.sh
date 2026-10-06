#!/usr/bin/env bash
# Launch a token on the local chain and trade it a few times (uses anvil dev accounts).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rpc="${LOCAL_RPC:-http://127.0.0.1:8545}"
cast=~/.foundry/bin/cast
dep="$root/contracts/deployments/31337.json"
get() { python3 -c "import json;print(json.load(open('$dep'))['$1'])"; }
factory=$(get factory); router=$(get router)
creator=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
trader=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
trader_addr=$($cast wallet address $trader)
name="${1:-Smoke Token}"; symbol="${2:-SMOKE}"; uri="${3:-}"
deadline=$(( $(date +%s) + 3600 ))

$cast send $factory "launch(string,string,string,bool,uint256)" "$name" "$symbol" "$uri" true 0 \
  --value 0.05ether --private-key $creator --rpc-url $rpc > /dev/null
count=$($cast call $factory "tokenCount()(uint256)" --rpc-url $rpc)
token=$($cast call $factory "allTokens(uint256)(address)" $((count - 1)) --rpc-url $rpc)
echo "token $token"
sleep 4 # past anti-snipe window
for v in 0.2 0.5 0.1; do
  $cast send $router "buy(address,uint256,address,uint256)" $token 0 $trader_addr $deadline \
    --value ${v}ether --private-key $trader --rpc-url $rpc > /dev/null
done
bal=$($cast call $token "balanceOf(address)(uint256)" $trader_addr --rpc-url $rpc | awk '{print $1}')
$cast send $token "approve(address,uint256)" $router $bal --private-key $trader --rpc-url $rpc > /dev/null
$cast send $router "sell(address,uint256,uint256,address,uint256)" $token $(python3 -c "print($bal // 3)") 0 $trader_addr $deadline \
  --private-key $trader --rpc-url $rpc > /dev/null
echo "traded: 3 buys + 1 sell by $trader_addr"
