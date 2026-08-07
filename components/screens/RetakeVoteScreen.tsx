"use client";

import { Avatar } from "../ui/Avatar";
import type { Partner, SessionState } from "../../lib/types";
import { store } from "../../lib/store/useSession";

export function RetakeVoteScreen({
  code,
  state,
  self,
}: {
  code: string;
  state: SessionState;
  self: Partner;
}) {
  const partnerCount = Object.keys(state.partners).length;
  const hasVotedToAdvance = state.retakeAdvanceVotes.includes(self.id);
  const advanceVotes = state.retakeAdvanceVotes.length;

  function toggleVote(shotIndex: number) {
    const votes = state.retakeVotes[shotIndex] ?? [];
    if (votes.includes(self.id)) return; // one vote per partner, no un-voting
    store.voteRetake(code, self.id, shotIndex);
  }

  return (
    <div className="flex flex-col items-center text-center gap-1 w-full">
      <h1 className="font-display text-2xl text-paper mb-1">Tap any photo to vote retake</h1>
      <p className="text-mist text-sm mb-6">Both must vote to unlock a retake</p>

      <div className="grid grid-cols-2 gap-2.5 w-full mb-6">
        {state.shots.map((shot) => {
          const votes = state.retakeVotes[shot.index] ?? [];
          const owner = state.partners[shot.ownerId];
          return (
            <button
              key={shot.index}
              onClick={() => toggleVote(shot.index)}
              className={`relative aspect-[3/4] rounded-lg overflow-hidden border ${
                votes.length > 0 ? "border-flash-pink/60" : "border-white/10"
              }`}
            >
              {shot.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={shot.photo}
                  alt={`Shot ${shot.index + 1}`}
                  className={`w-full h-full object-cover ${votes.length ? "opacity-40 grayscale" : ""}`}
                />
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center text-mist text-xs font-utility">
                  loading…
                </div>
              )}
              {owner && (
                <div className="absolute top-1.5 left-1.5">
                  <Avatar label={owner.label} />
                </div>
              )}
              <div className="absolute top-1.5 right-1.5 flex -space-x-1.5">
                {votes.map((pid) => {
                  const p = state.partners[pid];
                  return p ? <Avatar key={pid} label={p.label} /> : null;
                })}
              </div>
            </button>
          );
        })}
      </div>

      <div className="w-full">
        <div className="w-full rounded-xl px-4 py-3 mb-3 text-sm font-utility bg-paper/10 text-paper">
          {advanceVotes >= partnerCount
            ? "Both of you are ready to move on"
            : `${advanceVotes}/${partnerCount} partners are ready to continue`}
        </div>
        <button
          onClick={() => store.voteToAdvance(code, self.id)}
          disabled={hasVotedToAdvance}
          className={`w-full rounded-xl px-4 py-3 text-sm font-utility transition-colors ${
            hasVotedToAdvance
              ? "bg-white/10 text-mist cursor-not-allowed"
              : "bg-paper text-black hover:bg-paper/90"
          }`}
        >
          {hasVotedToAdvance ? "Waiting for your partner" : "I’m good with continuing"}
        </button>
      </div>
    </div>
  );
}
