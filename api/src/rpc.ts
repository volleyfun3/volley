export type RpcLog = {
  address: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
};

export class Rpc {
  private id = 0;
  constructor(private url: string) {}

  async batch<T = unknown>(calls: { method: string; params: unknown[] }[]): Promise<T[]> {
    if (calls.length === 0) return [];
    const body = calls.map((c) => ({ jsonrpc: "2.0", id: ++this.id, method: c.method, params: c.params }));
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`rpc http ${res.status}`);
    const json = (await res.json()) as { id: number; result?: T; error?: { message: string } }[];
    const byId = new Map(json.map((r) => [r.id, r]));
    return body.map((b) => {
      const r = byId.get(b.id);
      if (!r || r.error) throw new Error(`rpc ${b.method}: ${r?.error?.message ?? "missing response"}`);
      return r.result as T;
    });
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return (await this.batch<T>([{ method, params }]))[0];
  }

  blockNumber() {
    return this.call<string>("eth_blockNumber").then((h) => Number(h));
  }

  getLogs(filter: { address: string | string[]; fromBlock: number; toBlock: number; topics?: (string | null)[] }) {
    return this.call<RpcLog[]>("eth_getLogs", [
      {
        address: filter.address,
        fromBlock: "0x" + filter.fromBlock.toString(16),
        toBlock: "0x" + filter.toBlock.toString(16),
        topics: filter.topics,
      },
    ]);
  }

  async blockTimestamps(blocks: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    for (let i = 0; i < blocks.length; i += 50) {
      const chunk = blocks.slice(i, i + 50);
      const res = await this.batch<{ timestamp: string }>(
        chunk.map((b) => ({ method: "eth_getBlockByNumber", params: ["0x" + b.toString(16), false] })),
      );
      chunk.forEach((b, j) => out.set(b, Number(res[j].timestamp)));
    }
    return out;
  }
}
