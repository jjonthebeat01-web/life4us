"use client";

import { Avatar } from "../ui/Avatar";
import { ConfirmBar } from "../ui/ConfirmBar";
import { FORMATS } from "../../lib/content";
import type { Partner, SessionState } from "../../lib/types";
import { store } from "../../lib/store/useSession";

export function FormatSelectScreen({
  code,
  state,
  self,
  partner,
  isOwner,
}: {
  code: string;
  state: SessionState;
  self: Partner;
  partner: Partner | null;
  isOwner: boolean;
}) {
  const myPick = state.formatPicks[self.id];
  const partnerPick = partner ? state.formatPicks[partner.id] : undefined;
  const bothPicked = partner ? !!myPick && !!partnerPick : false;
  const matched = bothPicked && myPick === partnerPick;
  const owner = Object.values(state.partners).find((p) => p.isOwner);

  let status = "choose a strip length";
  if (bothPicked && !matched) status = "picks don't match — try again";
  else if (matched) status = `both picked ${FORMATS.find((f) => f.id === myPick)?.label}`;
  else if (myPick) status = "waiting on your partner";

  return (
    <div className="flex flex-col items-center text-center gap-1 w-full">
      <p className="font-utility text-xs uppercase tracking-widest text-mist mb-1">
        strip format
      </p>
      <h1 className="font-display text-2xl text-paper mb-6">How many shots?</h1>

      <div className="w-full flex flex-col gap-2.5">
        {FORMATS.map((f) => {
          const selectedByMe = myPick === f.id;
          const selectedByPartner = partnerPick === f.id;
          return (
            <button
              key={f.id}
              onClick={() => store.pickFormat(code, self.id, f.id)}
              className={`relative w-full rounded-xl border px-4 py-3 flex items-center gap-4 transition-colors ${
                selectedByMe ? "border-flash-pink" : "border-white/10 hover:border-white/25"
              }`}
            >
              <div
                className="grid gap-0.5 shrink-0"
                style={{
                  gridTemplateColumns: `repeat(${f.cols}, 10px)`,
                  gridTemplateRows: `repeat(${f.rows}, 10px)`,
                }}
              >
                {Array.from({ length: f.cols * f.rows }, (_, i) => (
                  <div key={i} className="bg-mist/60 rounded-[2px]" />
                ))}
              </div>
              <div className="text-left flex-1">
                <div className="font-utility text-sm text-paper">{f.label}</div>
                <div className="text-xs text-mist">{f.description}</div>
              </div>
              <div className="flex -space-x-1.5">
                {selectedByPartner && partner && <Avatar label={partner.label} />}
                {selectedByMe && <Avatar label={self.label} active />}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className={`w-full rounded-xl px-4 py-3 my-6 text-sm font-utility ${
          matched ? "bg-flash-pink/15 text-flash-pink" : "bg-white/5 text-mist"
        }`}
      >
        {status}
      </div>

      <div className="w-full">
        <ConfirmBar
          isOwner={isOwner}
          ownerLabel={owner?.label ?? "your partner"}
          ready={matched}
          label="next"
          onConfirm={() => store.confirmFormat(code, self.id)}
        />
      </div>
    </div>
  );
}
