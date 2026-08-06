"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "../ui/Frame";
import { Button } from "../ui/Button";
import { store } from "../../lib/store/useSession";

export function StartScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await store.createSession();
      router.push(`/s/${code}`);
    } catch {
      setError("Couldn't create a session. Try again.");
      setBusy(false);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError("Enter the full code your partner sent you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.joinSession(trimmed);
      router.push(`/s/${trimmed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that session.");
      setBusy(false);
    }
  }

  return (
    <Frame>
      <div className="flex flex-col items-center text-center gap-1">
        <div className="mb-4 flex items-center gap-3 rounded-full border border-white/10 bg-white/8 px-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-flash-pink/90">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="7" width="18" height="13" rx="2" stroke="#FAF6F0" strokeWidth="1.6" />
              <circle cx="12" cy="13.5" r="3.4" stroke="#FAF6F0" strokeWidth="1.6" />
              <path d="M8 7L9.3 4.5H14.7L16 7" stroke="#FAF6F0" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-left">
            <p className="font-utility text-[10px] uppercase tracking-[0.3em] text-mist">happy monthsary po</p>
            <p className="font-display text-lg text-flash-pink">life4us</p>
          </div>
        </div>

        <div className="mb-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
          <h1 className="font-display text-3xl text-mist">life4us</h1>
          <p className="mt-1 text-sm text-flash-pink">우리의 순간을 함께 담다</p>
          <p className="mt-2 text-sm text-mist">Hope you like this.</p>
        </div>

        <Button onClick={handleCreate} disabled={busy}>
          Create a session
        </Button>

        <div className="flex items-center gap-3 w-full my-6">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-mist text-xs font-utility">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="w-full text-left">
          <label className="text-sm text-mist mb-2 block" htmlFor="code">
            Have a code
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              maxLength={5}
              placeholder="XYPQ7"
              className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 font-utility tracking-[0.3em] text-paper placeholder:text-white/70 uppercase"
            />
            <button
              onClick={handleJoin}
              disabled={busy}
              aria-label="Join session"
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-flash-pink/35 bg-flash-pink/15 text-xl font-semibold text-paper transition-colors hover:border-flash-pink/60 hover:bg-flash-pink/25 disabled:opacity-50"
            >
              →
            </button>
          </div>
          {error && <p className="text-flash-pink text-xs mt-2">{error}</p>}
        </div>
      </div>
    </Frame>
  );
}
