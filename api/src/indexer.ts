import { DurableObject } from "cloudflare:workers";
import { parseEventLogs } from "viem";
import { launchFactoryAbi, launchHookAbi, launchTokenAbi } from "./abis";
import { Rpc, type RpcLog } from "./rpc";
import type { Env } from "./index";

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SUPPLY = 1_000_000_000;
const GRADUATION = 0.7386;
const MAX_SPAN = 20_000;
const SYNC_MS = 3_000;
const MAX_UPLOAD = 1_000_000;

const eventAbi = [...launchFactoryAbi, ...launchHookAbi];
const wei = (v: bigint) => Number(v) / 1e18;
const lc = (s: string) => s.toLowerCase();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

type Row = Record<string, SqlStorageValue>;

async function sha256(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Indexer extends DurableObject<Env> {
  private sql: SqlStorage;
  private rpc: Rpc;
  private syncing: Promise<void> | null = null;
  private lastSync = 0;
  private startPrice: number;
  private excluded: string[];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.rpc = new Rpc(env.RPC_URL);
    this.startPrice = Math.pow(1.0001, -Number(env.START_TICK || "200200"));
    this.excluded = [POOL_MANAGER, DEAD, ZERO, lc(env.FACTORY)];
    this.migrate();
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) == null) await ctx.storage.setAlarm(Date.now() + 1000);
    });
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY, creator TEXT, pool_id TEXT, name TEXT, symbol TEXT, metadata_uri TEXT,
        description TEXT, image TEXT, website TEXT, x TEXT, telegram TEXT,
        creator_rewards INTEGER, launch_block INTEGER, launch_ts INTEGER, launch_tx TEXT,
        burned REAL DEFAULT 0, graduated INTEGER DEFAULT 0, net_sold REAL DEFAULT 0,
        price REAL, pool_eth REAL DEFAULT 0, volume REAL DEFAULT 0, trade_count INTEGER DEFAULT 0,
        last_trade_ts INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY, token TEXT, trader TEXT, is_buy INTEGER, eth REAL, tokens REAL, fee REAL,
        price REAL, net_sold REAL, ts INTEGER, block INTEGER, tx TEXT
      );
      CREATE INDEX IF NOT EXISTS trades_token_ts ON trades(token, ts);
      CREATE INDEX IF NOT EXISTS trades_trader ON trades(trader);
      CREATE TABLE IF NOT EXISTS balances (token TEXT, holder TEXT, amount TEXT, PRIMARY KEY (token, holder));
      CREATE INDEX IF NOT EXISTS balances_holder ON balances(holder);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT, data BLOB, created INTEGER);
      CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, body TEXT, created INTEGER);
    `);
    try {
      this.sql.exec("ALTER TABLE tokens ADD COLUMN meta_tries INTEGER DEFAULT 0");
    } catch {}
  }

  private meta(key: string): string | null {
    const r = this.sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return r ? String(r.value) : null;
  }

  private setMeta(key: string, value: string) {
    this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  async alarm() {
    try {
      await this.sync();
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + SYNC_MS);
    }
  }

  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync()
        .catch((e) => console.error("sync failed", e))
        .finally(() => {
          this.syncing = null;
          this.lastSync = Date.now();
        });
    }
    return this.syncing;
  }

  private async doSync() {
    await this.refreshEthUsd();
    if (this.env.FACTORY === ZERO) return;
    const head = await this.rpc.blockNumber();
    let cursor = Number(this.meta("cursor") ?? Number(this.env.START_BLOCK) - 1);
    let span = MAX_SPAN;
    while (cursor < head) {
      const from = cursor + 1;
      const to = Math.min(head, cursor + span);
      try {
        await this.indexRange(from, to);
      } catch (e) {
        if (span > 100) {
          span = Math.floor(span / 2);
          continue;
        }
        throw e;
      }
      cursor = to;
      this.setMeta("cursor", String(cursor));
    }
    this.setMeta("head", String(head));
    await this.retryMetadata();
  }

  // Metadata hosts can be briefly unreachable when a launch is indexed; retry a few times.
  private async retryMetadata() {
    const rows = this.sql
      .exec(
        `SELECT address, metadata_uri FROM tokens
         WHERE metadata_uri != '' AND description IS NULL AND image IS NULL AND meta_tries < 5 LIMIT 5`,
      )
      .toArray();
    for (const r of rows) {
      const m = await this.resolveMetadata(String(r.metadata_uri));
      if (m) {
        this.sql.exec(
          "UPDATE tokens SET description = ?, image = ?, website = ?, x = ?, telegram = ?, meta_tries = 5 WHERE address = ?",
          str(m.description), str(m.image), str(m.website), str(m.x), str(m.telegram), r.address,
        );
      } else {
        this.sql.exec("UPDATE tokens SET meta_tries = meta_tries + 1 WHERE address = ?", r.address);
      }
    }
  }

  private async refreshEthUsd() {
    const at = Number(this.meta("eth_usd_at") ?? 0);
    if (Date.now() - at < 60_000) return;
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
        headers: { accept: "application/json", "user-agent": "volley-indexer" },
        signal: AbortSignal.timeout(4000),
      });
      const j = (await r.json()) as { ethereum?: { usd?: number } };
      if (j.ethereum?.usd) {
        this.setMeta("eth_usd", String(j.ethereum.usd));
        this.setMeta("eth_usd_at", String(Date.now()));
      } else {
        console.error("eth price: unexpected response", r.status);
      }
    } catch (e) {
      console.error("eth price", e);
    }
  }

  private async indexRange(from: number, to: number) {
    const coreLogs = await this.rpc.getLogs({ address: [this.env.FACTORY, this.env.HOOK], fromBlock: from, toBlock: to });
    const core = parseEventLogs({ abi: eventAbi, logs: coreLogs.map(toViemLog), strict: false });

    const known = this.sql.exec("SELECT address FROM tokens").toArray().map((r) => String(r.address));
    const launched = core.filter((l) => l.eventName === "TokenLaunched").map((l) => lc((l.args as { token: string }).token));
    const tokens = [...new Set([...known, ...launched])];

    const transferLogs: RpcLog[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      transferLogs.push(
        ...(await this.rpc.getLogs({ address: tokens.slice(i, i + 100), fromBlock: from, toBlock: to, topics: [TRANSFER_TOPIC] })),
      );
    }
    const transfers = parseEventLogs({ abi: launchTokenAbi, logs: transferLogs.map(toViemLog), eventName: "Transfer", strict: false });

    const blocks = [...new Set([...core, ...transfers].map((l) => Number(l.blockNumber)))];
    const ts = await this.rpc.blockTimestamps(blocks);

    const metas = new Map<string, Row>();
    for (const l of core) {
      if (l.eventName !== "TokenLaunched") continue;
      const uri = String((l.args as { metadataURI?: string }).metadataURI ?? "");
      const m = await this.resolveMetadata(uri);
      if (m) metas.set(uri, m);
    }

    const order = (l: { blockNumber: bigint | null; logIndex: number | null }) =>
      Number(l.blockNumber) * 1e6 + Number(l.logIndex);
    // TokenLaunched is emitted after the launch buy's Trade in the same tx, so register launches first.
    const launches = core.filter((l) => l.eventName === "TokenLaunched");
    const rest = [...core.filter((l) => l.eventName !== "TokenLaunched"), ...transfers].sort((a, b) => order(a) - order(b));

    this.ctx.storage.transactionSync(() => {
      for (const l of launches) {
        const a = l.args as {
          token: string; creator: string; poolId: string; name: string; symbol: string; metadataURI: string;
          creatorRewards: boolean; tokensBurned: bigint;
        };
        const m = metas.get(a.metadataURI) ?? {};
        this.sql.exec(
          `INSERT OR IGNORE INTO tokens (address, creator, pool_id, name, symbol, metadata_uri, description, image, website, x, telegram,
            creator_rewards, launch_block, launch_ts, launch_tx, burned, price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          lc(a.token), lc(a.creator), a.poolId, a.name, a.symbol, a.metadataURI,
          str(m.description), str(m.image), str(m.website), str(m.x), str(m.telegram),
          a.creatorRewards ? 1 : 0, Number(l.blockNumber), ts.get(Number(l.blockNumber)) ?? 0, l.transactionHash,
          wei(a.tokensBurned ?? 0n), this.startPrice,
        );
      }
      for (const l of rest) {
        const block = Number(l.blockNumber);
        const time = ts.get(block) ?? 0;
        if (l.eventName === "Transfer") {
          const a = l.args as { from: string; to: string; amount?: bigint; value?: bigint };
          const v = a.amount ?? a.value ?? 0n;
          const token = lc(l.address);
          if (lc(a.from) !== ZERO) this.addBalance(token, lc(a.from), -v);
          this.addBalance(token, lc(a.to), v);
        } else if (l.eventName === "Trade") {
          const a = l.args as {
            token: string; trader: string; isBuy: boolean; ethAmount: bigint; tokenAmount: bigint;
            platformFee: bigint; creatorFee: bigint; sqrtPriceX96: bigint; netSold: bigint;
          };
          const fee = wei(a.platformFee + a.creatorFee);
          const eth = wei(a.ethAmount);
          const sq = Number(a.sqrtPriceX96) / 2 ** 96;
          const price = 1 / (sq * sq);
          const poolDelta = a.isBuy ? eth - fee : -(eth + fee);
          const token = lc(a.token);
          this.sql.exec(
            `INSERT OR IGNORE INTO trades (id, token, trader, is_buy, eth, tokens, fee, price, net_sold, ts, block, tx)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            `${l.transactionHash}:${l.logIndex}`, token, lc(a.trader), a.isBuy ? 1 : 0, eth, wei(a.tokenAmount), fee,
            price, wei(a.netSold), time, block, l.transactionHash,
          );
          this.sql.exec(
            `UPDATE tokens SET price = ?, net_sold = ?, pool_eth = MAX(0, pool_eth + ?), volume = volume + ?,
             trade_count = trade_count + 1, last_trade_ts = ? WHERE address = ?`,
            price, wei(a.netSold), poolDelta, eth, time, token,
          );
        } else if (l.eventName === "Graduated") {
          const a = l.args as { token: string };
          this.sql.exec("UPDATE tokens SET graduated = 1 WHERE address = ?", lc(a.token));
        } else if (l.eventName === "CreatorTransferred") {
          const a = l.args as { token: string; to: string };
          this.sql.exec("UPDATE tokens SET creator = ? WHERE address = ?", lc(a.to), lc(a.token));
        }
      }
    });
  }

  private addBalance(token: string, holder: string, delta: bigint) {
    const r = this.sql.exec("SELECT amount FROM balances WHERE token = ? AND holder = ?", token, holder).toArray()[0];
    const next = BigInt(r ? String(r.amount) : "0") + delta;
    this.sql.exec(
      "INSERT INTO balances (token, holder, amount) VALUES (?, ?, ?) ON CONFLICT(token, holder) DO UPDATE SET amount = excluded.amount",
      token, holder, (next < 0n ? 0n : next).toString(),
    );
  }

  private async resolveMetadata(uri: string): Promise<Row | null> {
    const local = uri.match(/\/metadata\/([0-9a-f]{64})$/);
    if (local) {
      const r = this.sql.exec("SELECT body FROM metadata WHERE id = ?", local[1]).toArray()[0];
      if (r) return safeParse(String(r.body));
    }
    if (!/^https?:\/\//.test(uri) && !uri.startsWith("ipfs://")) return null;
    try {
      const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      return res.ok ? safeParse(await res.text()) : null;
    } catch {
      return null;
    }
  }

  // ---------- HTTP API ----------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (Date.now() - this.lastSync > SYNC_MS) void this.sync();
    try {
      if (req.method === "POST") {
        if (parts[0] === "sync") return await this.sync().then(() => json({ ok: true }));
        if (parts[0] === "upload") return await this.upload(req, url);
        if (parts[0] === "metadata") return await this.saveMetadata(req, url);
        return json({ error: "not found" }, 404);
      }
      switch (parts[0]) {
        case undefined:
        case "stats":
          return json(this.stats());
        case "tokens":
          if (!parts[1]) return json(this.listTokens(url.searchParams));
          return this.tokenRoute(lc(parts[1]), parts[2], url.searchParams);
        case "portfolio":
          return json(this.portfolio(lc(parts[1] ?? "")));
        case "images":
          return this.image(parts[1] ?? "");
        case "metadata": {
          const r = this.sql.exec("SELECT body FROM metadata WHERE id = ?", parts[1] ?? "").toArray()[0];
          return r ? new Response(String(r.body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" } }) : json({ error: "not found" }, 404);
        }
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  }

  private ethUsd() {
    return Number(this.meta("eth_usd") ?? 0);
  }

  private stats() {
    const c = this.sql.exec(
      "SELECT COUNT(*) AS tokens, COALESCE(SUM(volume), 0) AS volume, COALESCE(SUM(trade_count), 0) AS trades FROM tokens",
    ).one();
    return {
      chainId: Number(this.env.CHAIN_ID),
      factory: this.env.FACTORY,
      hook: this.env.HOOK,
      cursor: Number(this.meta("cursor") ?? 0),
      head: Number(this.meta("head") ?? 0),
      ethUsd: this.ethUsd(),
      tokens: Number(c.tokens),
      volumeEth: Number(c.volume),
      trades: Number(c.trades),
    };
  }

  private tokenSelect(where: string) {
    const ex = this.excluded.map(() => "?").join(",");
    return {
      sql: `SELECT t.*,
        (SELECT price FROM trades WHERE token = t.address AND ts <= ?1 ORDER BY ts DESC, block DESC LIMIT 1) AS price_24h,
        (SELECT COALESCE(SUM(eth), 0) FROM trades WHERE token = t.address AND ts > ?1) AS vol_24h,
        (SELECT COUNT(*) FROM balances b WHERE b.token = t.address AND b.amount != '0' AND b.holder NOT IN (${ex})) AS holders
        FROM tokens t ${where}`,
      binds: [Math.floor(Date.now() / 1000) - 86_400, ...this.excluded] as SqlStorageValue[],
    };
  }

  private listTokens(q: URLSearchParams) {
    const sort = q.get("sort") ?? "trending";
    const search = (q.get("q") ?? "").trim();
    const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 48)));
    const offset = Math.max(0, Number(q.get("offset") ?? 0));
    const conds: string[] = [];
    const extra: SqlStorageValue[] = [];
    if (search) {
      conds.push("(t.name LIKE ? OR t.symbol LIKE ? OR t.address = ?)");
      extra.push(`%${search}%`, `%${search}%`, lc(search));
    }
    if (sort === "graduated") conds.push("t.graduated = 1");
    if (sort === "near") conds.push("t.graduated = 0");
    if (q.get("creator")) {
      conds.push("t.creator = ?");
      extra.push(lc(q.get("creator")!));
    }
    const orderBy: Record<string, string> = {
      trending: "vol_24h DESC, t.last_trade_ts DESC, t.launch_ts DESC",
      new: "t.launch_ts DESC",
      top: "t.price DESC",
      near: "t.net_sold DESC",
      graduated: "t.price DESC",
      volume: "t.volume DESC",
    };
    const base = this.tokenSelect(conds.length ? `WHERE ${conds.join(" AND ")}` : "");
    const rows = this.sql
      .exec(`${base.sql} ORDER BY ${orderBy[sort] ?? orderBy.trending} LIMIT ${limit} OFFSET ${offset}`, ...base.binds, ...extra)
      .toArray();
    return { tokens: rows.map((r) => this.formatToken(r)), ethUsd: this.ethUsd() };
  }

  private formatToken(r: Row) {
    const usd = this.ethUsd();
    const price = Number(r.price ?? this.startPrice);
    const launchTs = Number(r.launch_ts);
    const ref = r.price_24h != null ? Number(r.price_24h) : launchTs > Date.now() / 1000 - 86_400 ? this.startPrice : price;
    const netSold = Number(r.net_sold);
    const poolTokens = Math.max(0, SUPPLY - Number(r.burned) - netSold);
    const liquidityEth = Number(r.pool_eth) + poolTokens * price;
    const fdvEth = price * SUPPLY;
    return {
      address: r.address,
      name: r.name,
      symbol: r.symbol,
      creator: r.creator,
      poolId: r.pool_id,
      metadataUri: r.metadata_uri,
      description: r.description,
      image: r.image,
      website: r.website,
      x: r.x,
      telegram: r.telegram,
      creatorRewards: Boolean(r.creator_rewards),
      createdAt: launchTs,
      launchBlock: Number(r.launch_block),
      launchTx: r.launch_tx,
      graduated: Boolean(r.graduated),
      graduationProgress: Math.min(1, netSold / (SUPPLY * GRADUATION)),
      netSold,
      burned: Number(r.burned),
      priceEth: price,
      priceUsd: price * usd,
      fdvEth,
      fdvUsd: fdvEth * usd,
      change24h: ref > 0 ? (price - ref) / ref : 0,
      volume24hEth: Number(r.vol_24h ?? 0),
      volume24hUsd: Number(r.vol_24h ?? 0) * usd,
      volumeEth: Number(r.volume),
      liquidityEth,
      liquidityUsd: liquidityEth * usd,
      poolEth: Number(r.pool_eth),
      holders: Number(r.holders ?? 0),
      trades: Number(r.trade_count),
      lastTradeAt: Number(r.last_trade_ts),
    };
  }

  private tokenRoute(addr: string, sub: string | undefined, q: URLSearchParams): Response {
    const base = this.tokenSelect("WHERE t.address = ?");
    const row = this.sql.exec(base.sql, ...base.binds, addr).toArray()[0];
    if (!row) return json({ error: "token not found" }, 404);
    if (!sub) return json({ token: this.formatToken(row), ethUsd: this.ethUsd() });
    if (sub === "trades") {
      const limit = Math.min(200, Number(q.get("limit") ?? 50));
      const rows = this.sql.exec(`SELECT * FROM trades WHERE token = ? ORDER BY block DESC, id DESC LIMIT ${limit}`, addr).toArray();
      return json({
        trades: rows.map((t) => ({
          id: t.id, trader: t.trader, isBuy: Boolean(t.is_buy), eth: t.eth, tokens: t.tokens, fee: t.fee,
          priceEth: t.price, ts: t.ts, tx: t.tx, block: t.block,
        })),
      });
    }
    if (sub === "holders") {
      const rows = this.sql
        .exec("SELECT holder, amount FROM balances WHERE token = ? AND amount != '0'", addr)
        .toArray()
        .map((h) => ({ holder: String(h.holder), amount: wei(BigInt(String(h.amount))) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 100)
        .map((h) => ({
          ...h,
          pct: h.amount / SUPPLY,
          label: h.holder === POOL_MANAGER ? "pool" : h.holder === DEAD ? "burn" : h.holder === row.creator ? "creator" : null,
        }));
      return json({ holders: rows });
    }
    if (sub === "candles") return json({ candles: this.candles(addr, Number(row.launch_ts), q) });
    return json({ error: "not found" }, 404);
  }

  private candles(addr: string, launchTs: number, q: URLSearchParams) {
    const res = [15, 60, 300, 900, 3600, 14400, 86400].includes(Number(q.get("res"))) ? Number(q.get("res")) : 60;
    const rows = this.sql.exec("SELECT ts, price, eth FROM trades WHERE token = ? ORDER BY ts, block, id", addr).toArray();
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
    const out: Candle[] = [];
    let prev = this.startPrice;
    if (rows.length === 0 || Number(rows[0].ts) > launchTs) {
      const t = launchTs - (launchTs % res);
      out.push({ time: t, open: prev, high: prev, low: prev, close: prev, volume: 0 });
    }
    for (const r of rows) {
      const t = Number(r.ts) - (Number(r.ts) % res);
      const p = Number(r.price);
      let c = out[out.length - 1];
      if (!c || c.time !== t) {
        c = { time: t, open: prev, high: Math.max(prev, p), low: Math.min(prev, p), close: p, volume: 0 };
        out.push(c);
      }
      c.high = Math.max(c.high, p);
      c.low = Math.min(c.low, p);
      c.close = p;
      c.volume += Number(r.eth);
      prev = p;
    }
    return out;
  }

  private portfolio(wallet: string) {
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) return { error: "bad wallet" };
    const base = this.tokenSelect("WHERE t.address IN (SELECT token FROM balances WHERE holder = ? AND amount != '0')");
    const held = this.sql.exec(base.sql, ...base.binds, wallet).toArray().map((r) => this.formatToken(r));
    const bal = new Map(
      this.sql
        .exec("SELECT token, amount FROM balances WHERE holder = ? AND amount != '0'", wallet)
        .toArray()
        .map((r) => [String(r.token), wei(BigInt(String(r.amount)))]),
    );
    const created = this.listTokens(new URLSearchParams({ creator: wallet, sort: "new", limit: "100" })).tokens;
    const holdings = held
      .map((t) => {
        const amount = bal.get(String(t.address)) ?? 0;
        return { token: t, amount, valueEth: amount * t.priceEth, valueUsd: amount * t.priceUsd };
      })
      .sort((a, b) => b.valueEth - a.valueEth);
    const trades = this.sql
      .exec(
        `SELECT tr.*, t.symbol, t.name, t.image FROM trades tr JOIN tokens t ON t.address = tr.token
         WHERE tr.trader = ? ORDER BY tr.block DESC LIMIT 50`,
        wallet,
      )
      .toArray()
      .map((t) => ({
        id: t.id, token: t.token, symbol: t.symbol, name: t.name, image: t.image, isBuy: Boolean(t.is_buy),
        eth: t.eth, tokens: t.tokens, priceEth: t.price, ts: t.ts, tx: t.tx,
      }));
    return { holdings, created, trades, ethUsd: this.ethUsd() };
  }

  private async upload(req: Request, url: URL) {
    const mime = (req.headers.get("content-type") ?? "").split(";")[0];
    if (!/^image\/(png|jpeg|gif|webp)$/.test(mime)) return json({ error: "png, jpeg, gif or webp only" }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD) return json({ error: "image must be under 1 MB" }, 400);
    const id = await sha256(buf);
    this.sql.exec("INSERT OR IGNORE INTO uploads (id, mime, data, created) VALUES (?, ?, ?, ?)", id, mime, buf, Date.now());
    return json({ url: `${url.origin}/images/${id}` });
  }

  private image(id: string) {
    const r = this.sql.exec("SELECT mime, data FROM uploads WHERE id = ?", id).toArray()[0];
    if (!r) return json({ error: "not found" }, 404);
    return new Response(r.data as ArrayBuffer, {
      headers: { "content-type": String(r.mime), "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  private async saveMetadata(req: Request, url: URL) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid json" }, 400);
    const clean: Record<string, string> = {};
    for (const k of ["description", "image", "website", "x", "telegram"]) {
      const v = body[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, k === "description" ? 1000 : 300);
    }
    const text = JSON.stringify(clean);
    const id = await sha256(new TextEncoder().encode(text));
    this.sql.exec("INSERT OR IGNORE INTO metadata (id, body, created) VALUES (?, ?, ?)", id, text, Date.now());
    return json({ uri: `${url.origin}/metadata/${id}` });
  }
}

function toViemLog(l: RpcLog) {
  return {
    address: l.address,
    topics: l.topics,
    data: l.data,
    blockNumber: BigInt(l.blockNumber),
    transactionHash: l.transactionHash,
    logIndex: Number(l.logIndex),
    blockHash: null,
    transactionIndex: null,
    removed: false,
  } as const;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function safeParse(s: string): Row | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Row) : null;
  } catch {
    return null;
  }
}
