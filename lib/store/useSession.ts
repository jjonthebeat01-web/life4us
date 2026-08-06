"use client";

import { useEffect, useRef, useState } from "react";
import { HEARTBEAT_INTERVAL_MS, localMockStore } from "./localMockStore";
import { supabaseSessionStore } from "./supabaseSessionStore";
import { supabase } from "../supabase/client";
import type { SessionState } from "../types";
import type { SessionStore } from "./types";

// Real deployment once NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set; falls
// back to the local BroadcastChannel-based mock store for plain `npm run dev`
// with no env configured, so local UI iteration still works without Supabase.
export const store: SessionStore = supabase ? supabaseSessionStore : localMockStore;

if (typeof window !== "undefined") {
  console.info(`[photobooth] using ${supabase ? "Supabase" : "local mock"} session store`);
}

export function useSession(code: string, partnerId: string | null) {
  const [state, setState] = useState<SessionState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!code) return;
    const unsub = store.subscribe(code, (s) => {
      setState(s);
      setLoaded(true);
    });
    return unsub;
  }, [code]);

  useEffect(() => {
    if (!code || !partnerId) return;
    store.heartbeat(code, partnerId);
    const id = window.setInterval(() => {
      store.heartbeat(code, partnerId);
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [code, partnerId]);

  const self = partnerId && state ? state.partners[partnerId] ?? null : null;
  const partner =
    state && partnerId
      ? Object.values(state.partners).find((p) => p.id !== partnerId) ?? null
      : null;
  const isOwner = !!(self && state && state.ownerId === self.id);

  return { state, loaded, self, partner, isOwner };
}

/** Per-tab identity for the current session code, set at create/join time. */
export function usePartnerId(code: string) {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    setPartnerId(window.sessionStorage.getItem(`photobooth:partner:${code}`));
  }, [code]);
  return partnerId;
}
