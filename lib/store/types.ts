import type { FormatId, SessionState } from "../types";

/**
 * Everything a screen needs from a backend. Implement this once against
 * BroadcastChannel/localStorage (local dev), and again against AWS AppSync +
 * DynamoDB for real deployment — screens never talk to a backend directly.
 */
export interface SessionStore {
  /** Create a new session, return its code, and become its owner. */
  createSession(): Promise<{ code: string; partnerId: string }>;

  /** Join an existing session by code. Rejects if code doesn't exist. */
  joinSession(code: string): Promise<{ partnerId: string }>;

  /** Subscribe to live state for a session. Returns an unsubscribe fn. */
  subscribe(code: string, cb: (state: SessionState | null) => void): () => void;

  /** Heartbeat so the backend can detect disconnects for grace-period transfer. */
  heartbeat(code: string, partnerId: string): Promise<void>;

  /** Explicit leave (tab closed / user backs out). */
  leave(code: string, partnerId: string): Promise<void>;

  /** Template vote: record this partner's pick. */
  pickTemplate(code: string, partnerId: string, templateId: string): Promise<void>;

  /** Owner confirms once both picks match. */
  confirmTemplate(code: string, partnerId: string): Promise<void>;

  pickFormat(code: string, partnerId: string, formatId: FormatId): Promise<void>;
  confirmFormat(code: string, partnerId: string): Promise<void>;

  /** Either partner fires the synced countdown for the current shot. */
  startCountdown(code: string, partnerId: string): Promise<void>;

  /** Each device submits its own local full-res frame for the active shot. */
  submitFrame(code: string, partnerId: string, shotIndex: number, dataUrl: string): Promise<void>;

  /** Either partner votes a shot for retake. */
  voteRetake(code: string, partnerId: string, shotIndex: number): Promise<void>;

  /** Either partner votes to move on past the retake step once no more retakes are wanted. */
  voteToAdvance(code: string, partnerId: string): Promise<void>;

  /** Owner confirms a retake once 2 votes are in; loops capture back to that shot. */
  confirmRetake(code: string, partnerId: string, shotIndex: number): Promise<void>;

  /** Either partner can change the filter; live-synced, no vote needed. */
  setFilter(code: string, partnerId: string, filterId: string): Promise<void>;

  /** Advance the flow (e.g. after filter -> shared view). */
  advanceStep(code: string, partnerId: string, step: SessionState["step"]): Promise<void>;

  /**
   * Optional — only implemented by stores where photo frames don't already
   * ride along inside the synced state (i.e. the Supabase store). Lets
   * usePeerConnection.ts hand over its WebRTC data channel once it opens, and
   * feed in frames received from the partner over that channel, without every
   * screen needing to know this plumbing exists.
   */
  setDataChannel?(code: string, channel: RTCDataChannel | null): void;
  receiveRemoteFrame?(code: string, shotIndex: number, partnerId: string, dataUrl: string): void;

  /** Only implemented by the Supabase store — the Broadcast channel used for WebRTC signaling. Loosely typed here to avoid coupling this interface to @supabase/supabase-js. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRtcChannel?(code: string): any;
}
