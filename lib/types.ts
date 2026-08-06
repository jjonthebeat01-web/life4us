export type Step =
  | "lobby"
  | "template"
  | "format"
  | "capture"
  | "retake"
  | "filter"
  | "shared";

export type FormatId = "1x4" | "2x2" | "2x4";

export const FORMAT_SHOT_COUNT: Record<FormatId, number> = {
  "1x4": 4,
  "2x2": 4,
  "2x4": 8,
};

export interface Partner {
  id: string;
  label: "M" | "J"; // simple two-letter identity, avatar initial
  isOwner: boolean;
  connectedAt: number;
  lastSeen: number; // heartbeat for grace-period disconnect detection
}

export interface Shot {
  index: number;
  /** data URLs, keyed by partner id — each device contributes its own local frame */
  frames: Record<string, string>;
  lockedAt: number | null;
}

export interface SessionState {
  code: string;
  createdAt: number;
  ownerId: string | null;
  step: Step;
  partners: Record<string, Partner>;

  // template vote
  templatePicks: Record<string, string>;
  templateConfirmed: string | null;

  // format vote
  formatPicks: Record<string, FormatId>;
  formatConfirmed: FormatId | null;

  // capture
  shots: Shot[];
  countdownSeed: number | null; // incrementing value broadcasts "start countdown now"
  activeShotIndex: number;

  // retake
  retakeVotes: Record<number, string[]>; // shotIndex -> partnerIds who voted
  retakeConfirmedIndex: number | null;
  retakeAdvanceVotes: string[]; // partnerIds who voted to continue past retakes

  // filter
  filterId: string;

  // presence bookkeeping
  expiresAt: number | null; // idle-lobby auto-expiry
}

export function emptySessionState(code: string): SessionState {
  return {
    code,
    createdAt: Date.now(),
    ownerId: null,
    step: "lobby",
    partners: {},
    templatePicks: {},
    templateConfirmed: null,
    formatPicks: {},
    formatConfirmed: null,
    shots: [],
    countdownSeed: null,
    activeShotIndex: 0,
    retakeVotes: {},
    retakeConfirmedIndex: null,
    retakeAdvanceVotes: [],
    filterId: "none",
    expiresAt: Date.now() + LOBBY_IDLE_TIMEOUT_MS,
  };
}

export const LOBBY_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min, no second partner joins
export const OWNER_GRACE_PERIOD_MS = 20 * 1000; // 20s before ownership auto-transfers
export const HEARTBEAT_INTERVAL_MS = 4 * 1000;
