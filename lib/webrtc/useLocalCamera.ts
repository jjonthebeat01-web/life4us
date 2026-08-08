"use client";

import { useEffect, useState } from "react";

export function useLocalCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let s: MediaStream | null = null;

    navigator.mediaDevices
      ?.getUserMedia({
        // Bumped from 1280 now that the strip renders at 3x scale — source
        // photos need enough native detail to not become the new bottleneck
        // once cells are drawn that much larger.
        video: { width: { ideal: 1920 }, height: { ideal: 1920 }, facingMode: "user" },
        audio: false,
      })
      .then((mediaStream) => {
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        s = mediaStream;
        setStream(mediaStream);
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(
          err.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera permission and reload."
            : `Couldn't access the camera (${err.name}).`
        );
      });

    return () => {
      active = false;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { stream, error };
}