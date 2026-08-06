"use client";

import {
  emptySessionState,
  FORMAT_SHOT_COUNT,
  HEARTBEAT_INTERVAL_MS,
  LOBBY_IDLE_TIMEOUT_MS,
  OWNER_GRACE_PERIOD_MS,
  type FormatId,
  type SessionState,
  type Shot,
} from "../types";
import type { SessionStore } from "./types";

const STORAGE_PREFIX = "photobooth:session:";
const CHANNEL_PREFIX = "photobooth:channel:";
const PARTNER_ID_PREFIX = "photobooth:partner:"; // per-tab, per-code identity for "resume by code"

function storageKey(code: string) {
  return STORAGE_PREFIX + code;
}

function readState(code: string): SessionState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(code));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

function writeState(code: string, state: SessionState) {
  window.localStorage.setItem(storageKey(code), JSON.stringify(state));
  getChannel(code).postMessage({ type: "update" });
}

function deleteState(code: string) {
  window.localStorage.removeItem(storageKey(code));
  getChannel(code).postMessage({ type: "update" });
}

const channels = new Map<string, BroadcastChannel>();
function getChannel(code: string): BroadcastChannel {
  let ch = channels.get(code);
  if (!ch) {
    ch = new BroadcastChannel(CHANNEL_PREFIX + code);
    channels.set(code, ch);
  }
  return ch;
}

function myPartnerId(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PARTNER_ID_PREFIX + code);
}

function rememberPartnerId(code: string, partnerId: string) {
  window.sessionStorage.setItem(PARTNER_ID_PREFIX + code, partnerId);
}

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function otherConnectedPartner(state: SessionState, excludeId: string): string | null {
  const now = Date.now();
  for (const p of Object.values(state.partners)) {
    if (p.id === excludeId) continue;
    if (now - p.lastSeen <= OWNER_GRACE_PERIOD_MS * 3) return p.id;
  }
  return null;
}

/** Re-derives ownership / expiry each time state is read, so every tab self-heals. */
function reconcile(state: SessionState): SessionState {
  const now = Date.now();
  let next = state;

  // Owner grace-period auto-transfer
  if (next.ownerId) {
    const owner = next.partners[next.ownerId];
    if (owner && now - owner.lastSeen > OWNER_GRACE_PERIOD_MS) {
      const successor = otherConnectedPartner(next, next.ownerId);
      if (successor) {
        next = {
          ...next,
          ownerId: successor,
          partners: {
            ...next.partners,
            [successor]: { ...next.partners[successor], isOwner: true },
            [next.ownerId]: { ...next.partners[next.ownerId], isOwner: false },
          },
        };
      }
    }
  }

  if (next.step === "lobby") {
    const connectedPartners = Object.values(next.partners).filter(
      (partner) => now - partner.lastSeen <= OWNER_GRACE_PERIOD_MS * 3
    );
    if (connectedPartners.length >= 2) {
      next = { ...next, step: "template" };
    }
  }

  return next;
}

function mutate(code: string, fn: (s: SessionState) => SessionState): SessionState {
  const current = readState(code) ?? emptySessionState(code);
  const reconciled = reconcile(current);
  const next = reconcile(fn(reconciled));
  writeState(code, next);
  return next;
}

export class LocalMockStore implements SessionStore {
  async createSession() {
    const code = genCode();
    const partnerId = genId();
    const now = Date.now();
    const state = emptySessionState(code);
    state.ownerId = partnerId;
    state.partners[partnerId] = {
      id: partnerId,
      label: "M",
      isOwner: true,
      connectedAt: now,
      lastSeen: now,
    };
    writeState(code, state);
    rememberPartnerId(code, partnerId);
    return { code, partnerId };
  }

  async joinSession(code: string) {
    const existing = readState(code);
    if (!existing) {
      throw new Error("That code doesn't match an active session.");
    }

    const resumeId = myPartnerId(code);
    if (resumeId && existing.partners[resumeId]) {
      mutate(code, (s) => ({
        ...s,
        partners: {
          ...s.partners,
          [resumeId]: { ...s.partners[resumeId], lastSeen: Date.now() },
        },
      }));
      return { partnerId: resumeId };
    }

    const now = Date.now();
    const connectedCount = Object.values(existing.partners).filter(
      (p) => now - p.lastSeen <= OWNER_GRACE_PERIOD_MS * 3
    ).length;
    if (connectedCount >= 2) {
      throw new Error("This session already has two partners connected.");
    }

    const partnerId = genId();
    const usedLabels = new Set(Object.values(existing.partners).map((p) => p.label));
    const label = usedLabels.has("M") ? "J" : "M";

    mutate(code, (s) => ({
      ...s,
      expiresAt: null, // second partner joined, lobby no longer idle-expires
      partners: {
        ...s.partners,
        [partnerId]: {
          id: partnerId,
          label,
          isOwner: !s.ownerId,
          connectedAt: now,
          lastSeen: now,
        },
      },
      ownerId: s.ownerId ?? partnerId,
    }));
    rememberPartnerId(code, partnerId);
    return { partnerId };
  }

  subscribe(code: string, cb: (state: SessionState | null) => void) {
    const emit = () => {
      const raw = readState(code);
      if (!raw) {
        cb(null);
        return;
      }
      const reconciled = reconcile(raw);
      if (reconciled !== raw) writeState(code, reconciled);

      // idle lobby auto-expiry
      if (
        reconciled.step === "lobby" &&
        Object.keys(reconciled.partners).length < 2 &&
        reconciled.expiresAt &&
        Date.now() > reconciled.expiresAt
      ) {
        deleteState(code);
        cb(null);
        return;
      }
      cb(reconciled);
    };

    emit();
    const ch = getChannel(code);
    const onMsg = () => emit();
    ch.addEventListener("message", onMsg);

    // Fallback for browsers/tabs where BroadcastChannel timing is inconsistent,
    // and to re-check grace-period/expiry logic even with no incoming messages.
    const interval = window.setInterval(emit, 1500);

    return () => {
      ch.removeEventListener("message", onMsg);
      window.clearInterval(interval);
    };
  }

  async heartbeat(code: string, partnerId: string) {
    mutate(code, (s) => {
      if (!s.partners[partnerId]) return s;
      return {
        ...s,
        partners: {
          ...s.partners,
          [partnerId]: { ...s.partners[partnerId], lastSeen: Date.now() },
        },
      };
    });
  }

  async leave(code: string, partnerId: string) {
    mutate(code, (s) => {
      if (!s.partners[partnerId]) return s;
      return {
        ...s,
        partners: {
          ...s.partners,
          [partnerId]: { ...s.partners[partnerId], lastSeen: 0 },
        },
      };
    });
  }

  async pickTemplate(code: string, partnerId: string, templateId: string) {
    mutate(code, (s) => ({
      ...s,
      templatePicks: { ...s.templatePicks, [partnerId]: templateId },
    }));
  }

  async confirmTemplate(code: string, partnerId: string) {
    mutate(code, (s) => {
      if (s.ownerId !== partnerId) return s;
      const picks = Object.values(s.templatePicks);
      const partnerCount = Object.keys(s.partners).length;
      if (picks.length < partnerCount) return s;
      const [first, ...rest] = picks;
      if (!rest.every((p) => p === first)) return s;
      return { ...s, templateConfirmed: first, step: "format" };
    });
  }

  async pickFormat(code: string, partnerId: string, formatId: FormatId) {
    mutate(code, (s) => ({
      ...s,
      formatPicks: { ...s.formatPicks, [partnerId]: formatId },
    }));
  }

  async confirmFormat(code: string, partnerId: string) {
    mutate(code, (s) => {
      if (s.ownerId !== partnerId) return s;
      const picks = Object.values(s.formatPicks);
      const partnerCount = Object.keys(s.partners).length;
      if (picks.length < partnerCount) return s;
      const [first, ...rest] = picks;
      if (!rest.every((p) => p === first)) return s;
      const count = FORMAT_SHOT_COUNT[first];
      const shots: Shot[] = Array.from({ length: count }, (_, i) => ({
        index: i,
        frames: {},
        lockedAt: null,
      }));
      return {
        ...s,
        formatConfirmed: first,
        shots,
        activeShotIndex: 0,
        step: "capture",
      };
    });
  }

  async startCountdown(code: string, partnerId: string) {
    void partnerId;
    mutate(code, (s) => ({ ...s, countdownSeed: Date.now() }));
  }

  async submitFrame(code: string, partnerId: string, shotIndex: number, dataUrl: string) {
    mutate(code, (s) => {
      const shot = s.shots[shotIndex];
      if (!shot || shot.lockedAt) return s;
      const frames = { ...shot.frames, [partnerId]: dataUrl };
      const partnerCount = Object.keys(s.partners).length;
      const complete = Object.keys(frames).length >= partnerCount;
      const nextShots = s.shots.map((sh, i) =>
        i === shotIndex
          ? { ...sh, frames, lockedAt: complete ? Date.now() : sh.lockedAt }
          : sh
      );
      const allLocked = nextShots.every((sh) => sh.lockedAt);
      return {
        ...s,
        shots: nextShots,
        activeShotIndex: complete
          ? Math.min(shotIndex + 1, nextShots.length - 1)
          : s.activeShotIndex,
        countdownSeed: null,
        retakeAdvanceVotes: allLocked ? [] : s.retakeAdvanceVotes,
        step: allLocked ? "retake" : s.step,
      };
    });
  }

  async voteRetake(code: string, partnerId: string, shotIndex: number) {
    mutate(code, (s) => {
      const existing = s.retakeVotes[shotIndex] ?? [];
      if (existing.includes(partnerId)) return s;
      return {
        ...s,
        retakeVotes: { ...s.retakeVotes, [shotIndex]: [...existing, partnerId] },
      };
    });
  }

  async voteToAdvance(code: string, partnerId: string) {
    mutate(code, (s) => {
      if (s.retakeAdvanceVotes.includes(partnerId)) return s;
      const partnerCount = Object.keys(s.partners).length;
      const nextVotes = [...s.retakeAdvanceVotes, partnerId];
      const allAgreed = nextVotes.length >= partnerCount;
      return {
        ...s,
        retakeAdvanceVotes: nextVotes,
        step: allAgreed ? "filter" : s.step,
      };
    });
  }

  async confirmRetake(code: string, partnerId: string, shotIndex: number) {
    mutate(code, (s) => {
      if (s.ownerId !== partnerId) return s;
      const votes = s.retakeVotes[shotIndex] ?? [];
      if (votes.length < 2) return s;
      const nextShots = s.shots.map((sh) =>
        sh.index === shotIndex ? { ...sh, frames: {}, lockedAt: null } : sh
      );
      const restVotes = { ...s.retakeVotes };
      delete restVotes[shotIndex];
      return {
        ...s,
        shots: nextShots,
        retakeVotes: restVotes,
        retakeAdvanceVotes: [],
        activeShotIndex: shotIndex,
        step: "capture",
      };
    });
  }

  async setFilter(code: string, partnerId: string, filterId: string) {
    void partnerId;
    mutate(code, (s) => ({ ...s, filterId }));
  }

  async advanceStep(code: string, _partnerId: string, step: SessionState["step"]) {
    mutate(code, (s) => ({ ...s, step }));
  }
}

export const localMockStore = new LocalMockStore();
export { HEARTBEAT_INTERVAL_MS, LOBBY_IDLE_TIMEOUT_MS };
