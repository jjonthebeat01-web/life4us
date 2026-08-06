"use client";

import { Avatar } from "../ui/Avatar";
import { ConfirmBar } from "../ui/ConfirmBar";
import { TEMPLATES } from "../../lib/content";
import type { Partner, SessionState } from "../../lib/types";
import { store } from "../../lib/store/useSession";

export function TemplateVoteScreen({
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
  const myPick = state.templatePicks[self.id];
  const partnerPick = partner ? state.templatePicks[partner.id] : undefined;
  const bothPicked = partner ? !!myPick && !!partnerPick : false;
  const matched = bothPicked && myPick === partnerPick;
  const owner = Object.values(state.partners).find((p) => p.isOwner);

  function pick(id: string) {
    store.pickTemplate(code, self.id, id);
  }

  let status = "pick a template you both like";
  if (bothPicked && !matched) status = "picks don't match — try again";
  if (matched) status = `both picked ${TEMPLATES.find((t) => t.id === myPick)?.name}`;
  else if (myPick) status = "waiting on your partner";

  return (
    <div className="flex flex-col items-center text-center gap-1 w-full">
      <p className="font-utility text-xs uppercase tracking-widest text-mist mb-1">
        simple themes
      </p>
      <h1 className="font-display text-2xl text-paper mb-6">Pick together</h1>

      <div className="flex gap-3 overflow-x-auto w-full pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {TEMPLATES.map((t) => {
          const selectedByMe = myPick === t.id;
          const selectedByPartner = partnerPick === t.id;
          return (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`relative snap-center shrink-0 w-[130px] rounded-xl border p-2 flex flex-col gap-1 transition-colors ${
                selectedByMe ? "border-flash-pink" : "border-white/10 hover:border-white/25"
              }`}
            >
              <div className="absolute top-1.5 right-1.5 flex -space-x-1.5">
                {selectedByPartner && partner && <Avatar label={partner.label} />}
                {selectedByMe && <Avatar label={self.label} active />}
              </div>
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="h-11 rounded-md"
                  style={{ backgroundColor: t.swatch }}
                />
              ))}
              <div className="h-1.5 rounded-full mt-0.5" style={{ backgroundColor: t.stripBase }} />
              <span className="font-utility text-xs text-mist mt-1.5 mb-0.5">{t.name}</span>
            </button>
          );
        })}
      </div>

      <div
        className={`w-full rounded-xl px-4 py-3 my-6 text-sm font-utility ${
          matched
            ? "bg-flash-pink/15 text-flash-pink"
            : "bg-white/5 text-mist"
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
          onConfirm={() => store.confirmTemplate(code, self.id)}
        />
      </div>
    </div>
  );
}
