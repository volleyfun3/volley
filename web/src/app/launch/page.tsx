"use client";
/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEther, parseEventLogs } from "viem";
import { useAccount, useBalance, useWriteContract } from "wagmi";
import { launchFactoryAbi } from "@/lib/abis";
import { saveMetadata, uploadImage } from "@/lib/api";
import { ADDR, chain, DEPLOYED, FEES } from "@/lib/config";
import { fmtEth } from "@/lib/format";
import { errMsg, useConfirm, useEnsureWallet } from "@/lib/tx";

const input =
  "h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm outline-none placeholder:text-dim focus:border-accent/50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        {hint && <span className="text-xs text-dim">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function LaunchPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: bal } = useBalance({ address, chainId: chain.id });
  const ensureWallet = useEnsureWallet();
  const confirm = useConfirm();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [creatorRewards, setCreatorRewards] = useState(true);
  const [buy, setBuy] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyEth = Number(buy || 0);
  const valid = name.trim().length > 0 && name.length <= 32 && /^[A-Za-z0-9]{1,10}$/.test(symbol) && buyEth >= 0;

  function pickFile(f: File | null) {
    setError(null);
    if (f && f.size > 1_000_000) return setError("Image must be under 1 MB");
    if (f && !/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return setError("Use a PNG, JPG, GIF or WEBP image");
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || step) return;
    setError(null);
    try {
      setStep("Connecting wallet…");
      await ensureWallet();
      let image = "";
      if (file) {
        setStep("Uploading image…");
        image = await uploadImage(file);
      }
      setStep("Saving metadata…");
      const meta: Record<string, string> = { description, image, website, x, telegram };
      const uri = await saveMetadata(Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim())));
      setStep("Confirm in wallet…");
      const hash = await writeContractAsync({
        address: ADDR.factory,
        abi: launchFactoryAbi,
        functionName: "launch",
        args: [name.trim(), symbol.toUpperCase(), uri, creatorRewards, 0n],
        value: parseEther(buy || "0"),
        chainId: chain.id,
      });
      setStep("Launching…");
      const receipt = await confirm(hash);
      const [ev] = parseEventLogs({ abi: launchFactoryAbi, logs: receipt.logs, eventName: "TokenLaunched" });
      router.push(`/token/?a=${ev.args.token}`);
    } catch (err) {
      setError(errMsg(err));
      setStep(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl py-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Launch a token</h1>
      <p className="mt-2 text-sm text-muted">
        1,000,000,000 supply, all of it in a Uniswap v4 pool. LP is locked forever. No presale, no team allocation.
      </p>

      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
            <Field label="Name" hint={`${name.length}/32`}>
              <input className={input} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Robin Frog" />
            </Field>
            <Field label="Ticker">
              <input
                className={`${input} font-mono uppercase`}
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                placeholder="RFROG"
              />
            </Field>
          </div>
          <Field label="Description" hint="optional">
            <textarea
              className={`${input} h-24 resize-none py-2.5`}
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token about?"
            />
          </Field>
          <Field label="Image" hint="PNG/JPG/GIF/WEBP, max 1 MB">
            <div className="flex items-center gap-4 rounded-xl border border-dashed border-line-2 bg-panel p-3">
              {preview ? (
                <img src={preview} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-panel-2 text-2xl text-dim">+</div>
              )}
              <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
                <span className="cursor-pointer rounded-lg border border-line-2 px-3 py-1.5 hover:bg-panel-2">
                  {file ? "Change" : "Choose image"}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                </span>
                {file && (
                  <button type="button" className="text-xs text-muted hover:text-down" onClick={() => pickFile(null)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Website" hint="optional">
              <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </Field>
            <Field label="X" hint="optional">
              <input className={input} value={x} onChange={(e) => setX(e.target.value)} placeholder="https://x.com/…" />
            </Field>
            <Field label="Telegram" hint="optional">
              <input className={input} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/…" />
            </Field>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-line bg-panel p-4">
            <Field label="First buy" hint={bal ? `balance ${fmtEth(Number(bal.formatted))}` : "optional"}>
              <div className="relative">
                <input
                  className={`${input} pr-14 font-mono`}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={buy}
                  onChange={(e) => setBuy(e.target.value)}
                  placeholder="0.0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">ETH</span>
              </div>
            </Field>
            <div className="mt-2 flex gap-1.5">
              {["0.01", "0.05", "0.1", "0.5"].map((v) => (
                <button key={v} type="button" onClick={() => setBuy(v)} className="flex-1 rounded-lg border border-line py-1 font-mono text-xs text-muted hover:border-accent/40 hover:text-fg">
                  {v}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-dim">Your first buy happens in the launch tx, before anyone else, with no anti-snipe tax.</p>

            <button
              type="button"
              onClick={() => setCreatorRewards((v) => !v)}
              className="mt-4 flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left"
            >
              <span>
                <span className="block text-sm">Creator rewards</span>
                <span className="block text-xs text-dim">
                  Earn {FEES.creatorBps / 100}% of every trade, claimable anytime
                </span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${creatorRewards ? "bg-accent" : "bg-line-2"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${creatorRewards ? "left-4.5" : "left-0.5"}`} />
              </span>
            </button>

            <dl className="mt-4 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between"><dt className="text-dim">Supply</dt><dd>1,000,000,000</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Trade fee</dt><dd>{(FEES.platformBps + (creatorRewards ? FEES.creatorBps : 0)) / 100}%</dd></div>
              <div className="flex justify-between"><dt className="text-dim">Launch cost</dt><dd>gas{buyEth > 0 ? ` + ${buy} ETH buy` : ""}</dd></div>
            </dl>

            <button
              disabled={!valid || !!step || !DEPLOYED}
              className="mt-4 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!DEPLOYED ? "Not deployed on this network" : step ?? (address ? "Launch token" : "Connect & launch")}
            </button>
            {error && <p className="mt-3 break-words text-xs text-down">{error}</p>}
          </div>
        </aside>
      </form>
    </div>
  );
}
