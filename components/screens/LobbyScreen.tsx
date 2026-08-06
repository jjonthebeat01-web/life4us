"use client";

import { useState } from "react";
import { Frame } from "../ui/Frame";
import { StripLoader } from "../ui/StripLoader";
import { Avatar } from "../ui/Avatar";
import type { SessionState } from "../../lib/types";

export function LobbyScreen({
  state,
  isOwner,
}: {
  state: SessionState;
  isOwner: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const partnerCount = Object.keys(state.partners).length;
  const waiting = partnerCount < 2;

  function copyCode() {
    navigator.clipboard?.writeText(state.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Frame>
      <div className="flex flex-col items-center text-center gap-1">
        <h1 className="font-display text-2xl text-flash-pink mb-1">
          {waiting ? "Waiting for your partner" : "You're both in"}
        </h1>
        <p className="text-flash-pink text-sm mb-6">
          {waiting ? "Share this code to connect" : "Starting soon"}
        </p>

        <button
          onClick={copyCode}
          className="font-utility text-3xl tracking-[0.35em] text-paper bg-black/30 border border-white/10 rounded-xl px-6 py-4 mb-2 hover:border-white/25 transition-colors"
        >
          {state.code}
        </button>
        <p className="text-xs text-mist mb-6">{copied ? "copied" : "tap to copy"}</p>

        <div className="flex items-center gap-3 mb-8">
          {Object.values(state.partners).map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1.5">
              <Avatar label={p.label} active size="md" />
              <span className="text-[11px] text-mist font-utility">
                {p.isOwner ? "owner" : "partner"}
              </span>
            </div>
          ))}
          {waiting && (
            <div className="flex flex-col items-center gap-1.5">
              <Avatar label="?" size="md" />
              <span className="text-[11px] text-mist font-utility">waiting</span>
            </div>
          )}
        </div>

        {waiting ? (
          <StripLoader label="listening for a partner" />
        ) : (
          <p className="text-sage text-sm font-body">
            {isOwner ? "You'll pick a template together next." : "Your partner will start the next step."}
          </p>
        )}
      </div>
    </Frame>
  );
}
