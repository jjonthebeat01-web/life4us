"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import {
  emptySessionState,
  LOBBY_IDLE_TIMEOUT_MS,
  OWNER_GRACE_PERIOD_MS,
  type FormatId,
  type Partner,
  type SessionState,
  type Shot,
} from "../types";
import type { SessionStore } from "./types";

const PARTNER_ID_PREFIX = "photobooth:partner:";

// --- Raw DB row shape. No `frames` here on purpose — photo data never
// touches Supabase, it travels peer-to-peer over the WebRTC data channel. ---
interface SessionRow {
  code: string;
  created_at: string;
  expires_at: string | null;
  owner_id: string | null;
  step: SessionState["step"];
  template_picks: Record<string, string>;
  template_confirmed: string | null;
  format_picks: Record<string, FormatId>;
  format_confirmed: FormatId | null;
  shots: { index: number; submittedBy: string[]; lockedAt: number | null }[];
  active_shot_index: number;
  countdown_seed: number | null;
  retake_votes: Record<string, string[]>;
  retake_confirmed_index: number | null;
  retake_advance_votes: string[];
  filter_id: string;
}

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function myPartnerId(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PARTNER_ID_PREFIX + code);
}

function rememberPartnerId(code: string, partnerId: string) {
  window.sessionStorage.setItem(PARTNER_ID_PREFIX + code, partnerId);
}

interface PresencePayload {
  id: string;
  label: "M" | "J";
  connectedAt: number;
}

/** Per-session bookkeeping the store keeps alive between subscribe() calls. */
interface SessionRuntime {
  dbChannel: RealtimeChannel;
  presenceChannel: RealtimeChannel;
  rtcChannel: RealtimeChannel; // WebRTC signaling broadcast — used by usePeerConnection.ts
  row: SessionRow | null;
  frameCache: Record<number, Record<string, string>>; // shotIndex -> partnerId -> dataUrl (never persisted)
  dataChannel: RTCDataChannel | null;
  listeners: Set<(state: SessionState | null) => void>;
  ownerLeaveTimer: number | null;
  expiryInterval: number | null;
}

const runtimes = new Map<string, SessionRuntime>();

function requireSupabase() {
  if (!supabase) throw new Error("Supabase env vars are not set (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).");
  return supabase;
}

function rowToState(row: SessionRow, presence: Record<string, Partner>, frameCache: SessionRuntime["frameCache"]): SessionState {
  const shots: Shot[] = row.shots.map((s) => ({
    index: s.index,
    lockedAt: s.lockedAt,
    frames: { ...(frameCache[s.index] ?? {}) },
  }));

  return {
    code: row.code,
    createdAt: new Date(row.created_at).getTime(),
    ownerId: row.owner_id,
    step: row.step,
    partners: presence,
    templatePicks: row.template_picks ?? {},
    templateConfirmed: row.template_confirmed,
    formatPicks: row.format_picks ?? {},
    formatConfirmed: row.format_confirmed,
    shots,
    countdownSeed: row.countdown_seed,
    activeShotIndex: row.active_shot_index,
    retakeVotes: Object.fromEntries(
      Object.entries(row.retake_votes ?? {}).map(([k, v]) => [Number(k), v])
    ),
    retakeConfirmedIndex: row.retake_confirmed_index,
    retakeAdvanceVotes: row.retake_advance_votes ?? [],
    filterId: row.filter_id,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
  };
}

function emit(code: string) {
  const rt = runtimes.get(code);
  if (!rt || !rt.row) {
    rt?.listeners.forEach((cb) => cb(null));
    return;
  }
  const presenceState = rt.presenceChannel.presenceState<PresencePayload>();
  const partners: Record<string, Partner> = {};
  for (const key of Object.keys(presenceState)) {
    const entry = presenceState[key]?.[0];
    if (!entry) continue;
    partners[entry.id] = {
      id: entry.id,
      label: entry.label,
      isOwner: entry.id === rt.row.owner_id,
      connectedAt: entry.connectedAt,
      lastSeen: Date.now(), // Presence itself is the liveness signal now
    };
  }
  const state = rowToState(rt.row, partners, rt.frameCache);
  rt.listeners.forEach((cb) => cb(state));
}

function ensureRuntime(code: string): SessionRuntime {
  let rt = runtimes.get(code);
  if (rt) return rt;
  const sb = requireSupabase();

  const dbChannel = sb
    .channel(`db:sessions:${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessions", filter: `code=eq.${code}` },
      (payload) => {
        const rt2 = runtimes.get(code);
        if (!rt2) return;
        if (payload.eventType === "DELETE") {
          rt2.row = null;
        } else {
          rt2.row = payload.new as SessionRow;
        }
        emit(code);
      }
    )
    .subscribe();

  const presenceChannel = sb.channel(`presence:${code}`, { config: { presence: { key: genId() } } });
  presenceChannel
    .on("presence", { event: "sync" }, () => emit(code))
    .on("presence", { event: "leave" }, ({ key }) => {
      const rt2 = runtimes.get(code);
      if (!rt2?.row) return;
      // Owner disconnected — start the grace-period auto-transfer timer.
      const presenceState = rt2.presenceChannel.presenceState<PresencePayload>();
      const leftId = Object.values(presenceState)
        .flat()
        .find((p) => p.id === rt2.row?.owner_id) ? null : rt2.row.owner_id;
      // (the entry for `key` is already gone from presenceState by the time this fires,
      // so if owner_id is no longer present at all, it was the owner who left)
      const ownerStillPresent = Object.values(presenceState)
        .flat()
        .some((p) => p.id === rt2.row?.owner_id);
      if (ownerStillPresent || !rt2.row.owner_id) return;
      void leftId;
      if (rt2.ownerLeaveTimer) window.clearTimeout(rt2.ownerLeaveTimer);
      rt2.ownerLeaveTimer = window.setTimeout(async () => {
        const rt3 = runtimes.get(code);
        if (!rt3?.row) return;
        const stillGone = !Object.values(rt3.presenceChannel.presenceState<PresencePayload>())
          .flat()
          .some((p) => p.id === rt3.row?.owner_id);
        const myId = myPartnerId(code);
        if (stillGone && myId) {
          await sb.from("sessions").update({ owner_id: myId }).eq("code", code).eq("owner_id", rt3.row.owner_id);
        }
      }, OWNER_GRACE_PERIOD_MS);
    })
    .subscribe();

  const rtcChannel = sb.channel(`rtc:${code}`, { config: { broadcast: { self: false } } }).subscribe();

  rt = {
    dbChannel,
    presenceChannel,
    rtcChannel,
    row: null,
    frameCache: {},
    dataChannel: null,
    listeners: new Set(),
    ownerLeaveTimer: null,
    expiryInterval: null,
  };
  runtimes.set(code, rt);
  return rt;
}

function teardownRuntime(code: string) {
  const rt = runtimes.get(code);
  if (!rt) return;
  if (rt.listeners.size > 0) return; // still in use elsewhere
  rt.dbChannel.unsubscribe();
  rt.presenceChannel.unsubscribe();
  rt.rtcChannel.unsubscribe();
  if (rt.ownerLeaveTimer) window.clearTimeout(rt.ownerLeaveTimer);
  if (rt.expiryInterval) window.clearInterval(rt.expiryInterval);
  runtimes.delete(code);
}

export class SupabaseSessionStore implements SessionStore {
  async createSession() {
    const sb = requireSupabase();
    const partnerId = genId();

    // Retry on the (very unlikely) chance of a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode();
      const empty = emptySessionState(code);
      const { error } = await sb.from("sessions").insert({
        code,
        owner_id: partnerId,
        step: empty.step,
        expires_at: new Date(Date.now() + LOBBY_IDLE_TIMEOUT_MS).toISOString(),
      });
      if (!error) {
        rememberPartnerId(code, partnerId);
        return { code, partnerId };
      }
      if (error.code !== "23505") throw error; // not a unique-violation, real error
    }
    throw new Error("Could not generate a unique session code, try again.");
  }

  async joinSession(code: string) {
    const sb = requireSupabase();
    const { data, error } = await sb.from("sessions").select("code").eq("code", code).maybeSingle();
    if (error || !data) throw new Error("That code doesn't match an active session.");

    const resumeId = myPartnerId(code);
    if (resumeId) return { partnerId: resumeId };

    const partnerId = genId();
    // Clear idle-lobby expiry now that a second partner is joining.
    await sb.from("sessions").update({ expires_at: null }).eq("code", code);
    rememberPartnerId(code, partnerId);
    return { partnerId };
  }

  subscribe(code: string, cb: (state: SessionState | null) => void) {
    const sb = requireSupabase();
    const rt = ensureRuntime(code);
    rt.listeners.add(cb);

    // Initial fetch — postgres_changes only pushes future updates, not current state.
    sb.from("sessions")
      .select("*")
      .eq("code", code)
      .maybeSingle()
      .then(({ data }) => {
        const rt2 = runtimes.get(code);
        if (!rt2) return;
        rt2.row = (data as SessionRow) ?? null;

        const myId = myPartnerId(code);
        const label: "M" | "J" =
          Object.values(rt2.presenceChannel.presenceState<PresencePayload>())
            .flat()
            .some((p) => p.label === "M")
            ? "J"
            : "M";
        if (myId) {
          rt2.presenceChannel.track({ id: myId, label, connectedAt: Date.now() } satisfies PresencePayload);
        }
        emit(code);
      });

    // Lobby -> template auto-advance once presence shows two partners, and
    // idle-lobby expiry — both re-checked periodically, mirroring the original
    // self-healing `reconcile()` from the local mock store.
    rt.expiryInterval = window.setInterval(async () => {
      const rt2 = runtimes.get(code);
      if (!rt2?.row) return;
      const count = Object.keys(rt2.presenceChannel.presenceState()).length;

      if (rt2.row.step === "lobby" && count >= 2) {
        await sb.from("sessions").update({ step: "template", expires_at: null }).eq("code", code).eq("step", "lobby");
      }
      if (
        rt2.row.step === "lobby" &&
        count < 2 &&
        rt2.row.expires_at &&
        Date.now() > new Date(rt2.row.expires_at).getTime()
      ) {
        await sb.from("sessions").delete().eq("code", code);
      }
    }, 1500);

    return () => {
      rt.listeners.delete(cb);
      if (rt.expiryInterval) window.clearInterval(rt.expiryInterval);
      teardownRuntime(code);
    };
  }

  async heartbeat() {
    // No-op — Supabase Presence handles liveness at the protocol level.
  }

  async leave(code: string) {
    const rt = runtimes.get(code);
    rt?.presenceChannel.untrack();
  }

  async pickTemplate(code: string, partnerId: string, templateId: string) {
    await requireSupabase().rpc("pick_template", { p_code: code, p_partner_id: partnerId, p_template_id: templateId });
  }

  async confirmTemplate(code: string, partnerId: string) {
    await requireSupabase().rpc("confirm_template", { p_code: code, p_partner_id: partnerId });
  }

  async pickFormat(code: string, partnerId: string, formatId: FormatId) {
    await requireSupabase().rpc("pick_format", { p_code: code, p_partner_id: partnerId, p_format_id: formatId });
  }

  async confirmFormat(code: string, partnerId: string) {
    await requireSupabase().rpc("confirm_format", { p_code: code, p_partner_id: partnerId });
  }

  async startCountdown(code: string) {
    await requireSupabase().from("sessions").update({ countdown_seed: Date.now() }).eq("code", code);
  }

  async submitFrame(code: string, partnerId: string, shotIndex: number, dataUrl: string) {
    const rt = runtimes.get(code);
    if (rt) {
      rt.frameCache[shotIndex] = { ...(rt.frameCache[shotIndex] ?? {}), [partnerId]: dataUrl };
      emit(code); // optimistic — show "you: captured" immediately, don't wait on the network
      if (rt.dataChannel && rt.dataChannel.readyState === "open") {
        rt.dataChannel.send(JSON.stringify({ shotIndex, partnerId, dataUrl }));
      }
    }
    await requireSupabase().rpc("submit_frame", { p_code: code, p_partner_id: partnerId, p_shot_index: shotIndex });
  }

  async voteRetake(code: string, partnerId: string, shotIndex: number) {
    await requireSupabase().rpc("vote_retake", { p_code: code, p_partner_id: partnerId, p_shot_index: shotIndex });
  }

  async voteToAdvance(code: string, partnerId: string) {
    await requireSupabase().rpc("vote_to_advance", { p_code: code, p_partner_id: partnerId });
  }

  async confirmRetake(code: string, partnerId: string, shotIndex: number) {
    const rt = runtimes.get(code);
    if (rt) delete rt.frameCache[shotIndex]; // clear stale frames for the shot being redone
    await requireSupabase().rpc("confirm_retake", { p_code: code, p_partner_id: partnerId, p_shot_index: shotIndex });
  }

  async setFilter(code: string, _partnerId: string, filterId: string) {
    void _partnerId;
    await requireSupabase().from("sessions").update({ filter_id: filterId }).eq("code", code);
  }

  async advanceStep(code: string, _partnerId: string, step: SessionState["step"]) {
    void _partnerId;
    await requireSupabase().from("sessions").update({ step }).eq("code", code);
  }

  setDataChannel(code: string, channel: RTCDataChannel | null) {
    const rt = runtimes.get(code);
    if (!rt) return;
    rt.dataChannel = channel;
    if (!channel) return;
    channel.onmessage = (ev) => {
      try {
        const { shotIndex, partnerId, dataUrl } = JSON.parse(ev.data);
        this.receiveRemoteFrame(code, shotIndex, partnerId, dataUrl);
      } catch (err) {
        console.error("bad frame payload over data channel", err);
      }
    };
  }

  receiveRemoteFrame(code: string, shotIndex: number, partnerId: string, dataUrl: string) {
    const rt = runtimes.get(code);
    if (!rt) return;
    rt.frameCache[shotIndex] = { ...(rt.frameCache[shotIndex] ?? {}), [partnerId]: dataUrl };
    emit(code);
  }

  /** Exposed for usePeerConnection.ts to send signaling messages on the same channel used for presence/db. */
  getRtcChannel(code: string): RealtimeChannel {
    return ensureRuntime(code).rtcChannel;
  }
}

export const supabaseSessionStore = new SupabaseSessionStore();
