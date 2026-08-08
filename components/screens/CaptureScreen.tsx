"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import type { Partner, SessionState } from "../../lib/types";
import { store } from "../../lib/store/useSession";
import { useLocalCamera } from "../../lib/webrtc/useLocalCamera";
import { usePeerConnection } from "../../lib/webrtc/usePeerConnection";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function CaptureScreen({
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
  const { stream: localStream, error: cameraError } = useLocalCamera();
  const { remoteStream, connectionState } = usePeerConnection({
    code,
    selfId: self.id,
    polite: !isOwner,
    localStream,
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const processedSeedRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  function beep(freq: number) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (audioCtxRef.current ??= new AC());
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // audio not available — countdown still works visually
    }
  }

  const round = state.activeShotIndex;
  const pairStart = round * 2;
  const mySlot = state.shots.find((sh) => sh.index >= pairStart && sh.index <= pairStart + 1 && sh.ownerId === self.id);
  const partnerSlot = state.shots.find((sh) => sh.index >= pairStart && sh.index <= pairStart + 1 && sh.ownerId !== self.id);
  const mySubmitted = !!mySlot?.lockedAt;
  const partnerSubmitted = !!partnerSlot?.lockedAt;
  const roundComplete = mySubmitted && partnerSubmitted;
  const totalRounds = state.shots.length / 2;

  // Only the first round needs a manual press. Once a round completes and
  // advances, auto-fire the next countdown instead of waiting on another tap.
  // Gated to the owner so only one side ever triggers it (both triggering
  // independently would risk two near-simultaneous countdown_seed writes and
  // a janky double-flash). Skips the very first mount deliberately — that one
  // still needs the initial "Start countdown" press.
  const prevRoundRef = useRef<number | null>(null);
  useEffect(() => {
    const prevRound = prevRoundRef.current;
    prevRoundRef.current = round;
    if (prevRound === null || prevRound === round) return; // first mount, or no actual advance
    if (!isOwner) return;
    if (round >= totalRounds) return; // all rounds already captured

    let cancelled = false;
    (async () => {
      await sleep(1200); // let "round captured" stay visible for a beat before the next countdown
      if (!cancelled) store.startCountdown(code, self.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [round, isOwner, totalRounds, code, self.id]);

  const [captureError, setCaptureError] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const mySlotRef = useRef(mySlot);
  useEffect(() => {
    mySlotRef.current = mySlot;
  }, [mySlot]);

  // Wait for the video element to actually have a decoded frame instead of
  // bailing immediately — mobile browsers (esp. Safari) can lag a beat behind
  // getUserMedia resolving, or briefly drop dimensions if the tab was backgrounded.
  async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 2000) {
    const start = Date.now();
    while (!video.videoWidth || video.readyState < 2) {
      if (Date.now() - start > timeoutMs) return false;
      await sleep(100);
    }
    return true;
  }

  async function captureAndSubmit() {
    const slot = mySlotRef.current;
    if (!slot || slot.lockedAt) return; // not my slot this round, or I've already captured it — nothing to do
    setCaptureError(null);
    try {
      const video = localVideoRef.current;
      if (!video) throw new Error("camera not attached");
      const ready = await waitForVideoReady(video);
      if (!ready) throw new Error("camera not ready");

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1); // mirror, since preview is mirrored
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      await store.submitFrame(code, self.id, slot.index, dataUrl);
      setStuck(false);
    } catch (err) {
      // Don't fail silently: surface it and let the user retry manually so the
      // session never freezes waiting on a submission that's never coming.
      // Showing the real message (not a generic placeholder) matters — it's
      // the difference between "camera not ready" and "upload failed" next time.
      console.error("capture failed", err);
      const msg = err instanceof Error ? err.message : "unknown error";
      setCaptureError(`Couldn't capture (${msg}) — tap retry.`);
      setStuck(true);
    }
  }

  useEffect(() => {
    const seed = state.countdownSeed;
    if (seed == null) return;
    if (processedSeedRef.current === seed) return;
    processedSeedRef.current = seed;

    let cancelled = false;
    (async () => {
      for (const n of [3, 2, 1]) {
        if (cancelled) return;
        setCountdownValue(n);
        beep(n === 1 ? 1046 : 784);
        await sleep(1000);
      }
      if (cancelled) return;
      setCountdownValue(null);
      await captureAndSubmit();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.countdownSeed]);

  const canStart = state.countdownSeed == null && countdownValue == null && !mySubmitted && !stuck;
  const isTwoColumnPreview = state.formatConfirmed === "2x2" || state.formatConfirmed === "2x4";
  const previewContainerClass = isTwoColumnPreview
    ? "grid grid-cols-2 gap-2 w-full mb-4"
    : "flex flex-col w-full gap-2 mb-4";

  let statusText = "sound synced on both screens";
  if (roundComplete) statusText = "round captured";
  else if (mySubmitted) statusText = "waiting for partner's photo";

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex items-center justify-between w-full mb-4">
        <span className="font-utility text-xs text-mist uppercase tracking-wider">
          round {round + 1} / {totalRounds}
        </span>
        <div className="flex gap-1">
          {state.shots.map((s, i) => (
            <span
              key={i}
              className={`h-1 w-6 rounded-full ${
                s.lockedAt
                  ? "bg-paper"
                  : Math.floor(i / 2) === round
                  ? "bg-flash-pink"
                  : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>

      <div className={previewContainerClass}>
        <div className="w-full rounded-xl overflow-hidden bg-black relative aspect-[4/3]">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <span className="absolute top-2 left-2 bg-black/50 text-paper text-xs font-utility px-2 py-1 rounded-full">
            {partner?.label ?? "?"} · {partnerSubmitted ? "captured" : remoteStream ? "live" : connectionState}
          </span>
        </div>

        <div className="w-full rounded-xl overflow-hidden bg-black relative aspect-[4/3]">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover -scale-x-100"
          />
          <span className="absolute top-2 left-2 bg-black/50 text-paper text-xs font-utility px-2 py-1 rounded-full">
            you · {cameraError ? "no camera" : mySubmitted ? "captured" : "live"}
          </span>
          {countdownValue != null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <div className="w-20 h-20 rounded-full border-2 border-paper flex items-center justify-center font-display text-4xl text-paper">
                {countdownValue}
              </div>
            </div>
          )}
        </div>
      </div>

      {cameraError && (
        <p className="text-flash-pink text-xs text-center mb-3">{cameraError}</p>
      )}
      {captureError && (
        <p className="text-flash-pink text-xs text-center mb-3">{captureError}</p>
      )}

      {stuck ? (
        <Button onClick={() => captureAndSubmit()}>Retry capture</Button>
      ) : canStart ? (
        <Button onClick={() => store.startCountdown(code, self.id)} disabled={!!cameraError}>
          Start countdown
        </Button>
      ) : (
        <p className="text-mist text-xs font-utility text-center">{statusText}</p>
      )}
    </div>
  );
}