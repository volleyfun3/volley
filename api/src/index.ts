import { Indexer } from "./indexer";

export { Indexer };

export interface Env {
  INDEXER: DurableObjectNamespace<Indexer>;
  RPC_URL: string;
  CHAIN_ID: string;
  FACTORY: string;
  HOOK: string;
  START_BLOCK: string;
  START_TICK: string;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function stub(env: Env) {
  return env.INDEXER.get(env.INDEXER.idFromName("main"));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const res = await stub(env).fetch(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await stub(env).fetch("https://indexer/sync", { method: "POST" });
  },
} satisfies ExportedHandler<Env>;
