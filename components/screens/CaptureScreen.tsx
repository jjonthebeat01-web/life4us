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
  const activeShotRef = useRef(state.activeShotIndex);
  useEffect(() => {
    activeShotRef.current = state.activeShotIndex;
  }, [state.activeShotIndex]);

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

  const [captureError, setCaptureError] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

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
    const shotIndex = activeShotRef.current;
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
      await store.submitFrame(code, self.id, shotIndex, dataUrl);
      setStuck(false);
    } catch (err) {
      // Don't fail silently: surface it and let the user retry manually so the
      // session never freezes waiting on a submission that's never coming.
      console.error("capture failed", err);
      setCaptureError("Couldn't capture — tap retry.");
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

  const currentShot = state.shots[state.activeShotIndex];
  const locked = !!currentShot?.lockedAt;
  const mySubmitted = currentShot ? !!currentShot.frames[self.id] : false;
  const canStart = state.countdownSeed == null && countdownValue == null && !locked && !stuck;
  const isTwoColumnPreview = state.formatConfirmed === "2x2" || state.formatConfirmed === "2x4";
  const previewContainerClass = isTwoColumnPreview
    ? "grid grid-cols-2 gap-2 w-full mb-4"
    : "flex flex-col w-full gap-2 mb-4";

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex items-center justify-between w-full mb-4">
        <span className="font-utility text-xs text-mist uppercase tracking-wider">
          shot {state.activeShotIndex + 1} / {state.shots.length}
        </span>
        <div className="flex gap-1">
          {state.shots.map((s, i) => (
            <span
              key={i}
              className={`h-1 w-6 rounded-full ${
                s.lockedAt
                  ? "bg-paper"
                  : i === state.activeShotIndex
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
            {partner?.label ?? "?"} · {remoteStream ? "live" : connectionState}
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
        <p className="text-mist text-xs font-utility text-center">
          {locked ? "shot captured" : "sound synced on both screens"}
        </p>
      )}
    </div>
  );
}