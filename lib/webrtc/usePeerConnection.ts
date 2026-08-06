"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase/client";
import { store } from "../store/useSession";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  // Free TURN fallback (Open Relay Project) — needed once this runs on two
  // separate real devices/networks.
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

type SignalMsg =
  | { kind: "description"; description: RTCSessionDescriptionInit; from: string }
  | { kind: "candidate"; candidate: RTCIceCandidateInit; from: string };

function toSerializableDescription(description: RTCSessionDescription | null): RTCSessionDescriptionInit | null {
  if (!description) return null;
  return {
    type: description.type,
    sdp: description.sdp,
  };
}

/**
 * Abstracts the signaling transport so the WebRTC negotiation logic below
 * doesn't care whether it's talking over BroadcastChannel (local dev, same
 * device, no Supabase env set) or Supabase Broadcast (real deployment, two
 * separate devices). Same send/receive shape either way.
 */
function createSignalTransport(code: string, onMessage: (msg: SignalMsg) => void) {
  if (supabase) {
    const channel =
      store.getRtcChannel?.(code) ??
      supabase.channel(`rtc:${code}`, { config: { broadcast: { self: false } } }).subscribe();
    channel.on("broadcast", { event: "signal" }, ({ payload }: { payload: SignalMsg }) => onMessage(payload));
    return {
      send(msg: SignalMsg) {
        channel.send({ type: "broadcast", event: "signal", payload: msg });
      },
      close() {
        // Owned/shared by the store's session runtime — don't unsubscribe here,
        // just stop caring about messages. The store tears it down on unmount.
      },
    };
  }

  const bc = new BroadcastChannel(`photobooth:rtc:${code}`);
  bc.onmessage = (ev: MessageEvent<SignalMsg>) => onMessage(ev.data);
  return {
    send(msg: SignalMsg) {
      bc.postMessage(msg);
    },
    close() {
      bc.close();
    },
  };
}

/**
 * Connects this tab's local stream to the partner's. Signaling transport is
 * BroadcastChannel or Supabase Broadcast depending on which store is active
 * (see createSignalTransport above) — everything else about the peer
 * connection is identical either way.
 *
 * Also opens a data channel used purely to send captured photo frames
 * peer-to-peer (never through Supabase) — see supabaseSessionStore.ts.
 */
export function usePeerConnection({
  code,
  selfId,
  polite,
  localStream,
}: {
  code: string | null;
  selfId: string | null;
  polite: boolean;
  localStream: MediaStream | null;
}) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    if (!code || !selfId || !localStream) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    let makingOffer = false;
    let ignoreOffer = false;

    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }

    // Declared before createSignalTransport() below, since that call needs a
    // real reference to hand off as its message callback — const bindings
    // (unlike function declarations) aren't hoisted, so order matters here.
    // The `transport.send(...)` calls inside are fine even though `transport`
    // is assigned after this: by the time handleMessage actually runs
    // (asynchronously, on an incoming message), transport already exists.
    const handleMessage = async (msg: SignalMsg) => {
      if (msg.from === selfId) return;
      try {
        if (msg.kind === "description") {
          const offerCollision =
            msg.description.type === "offer" && (makingOffer || pc.signalingState !== "stable");
          ignoreOffer = !polite && offerCollision;
          if (ignoreOffer) return;

          await pc.setRemoteDescription(msg.description);
          if (msg.description.type === "offer") {
            await pc.setLocalDescription();
            const description = toSerializableDescription(pc.localDescription);
            if (description) {
              transport.send({ kind: "description", description, from: selfId });
            }
          }
        } else if (msg.kind === "candidate") {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch (err) {
            if (!ignoreOffer) throw err;
          }
        }
      } catch (err) {
        console.error("signaling error", err);
      }
    };

    const transport = createSignalTransport(code, handleMessage);

    // --- Frame data channel ---
    // Convention to avoid both sides creating one: the impolite peer (the
    // session owner) creates it; the polite peer receives it via ondatachannel.
    function wireDataChannel(dc: RTCDataChannel) {
      dc.onopen = () => store.setDataChannel?.(code as string, dc);
      dc.onclose = () => store.setDataChannel?.(code as string, null);
      store.setDataChannel?.(code as string, dc); // hand it over now so onmessage gets attached
    }
    if (!polite) {
      wireDataChannel(pc.createDataChannel("frames"));
    }
    pc.ondatachannel = (ev) => wireDataChannel(ev.channel);

    const inboundRemote = new MediaStream();
    pc.ontrack = (ev) => {
      inboundRemote.addTrack(ev.track);
      setRemoteStream(new MediaStream(inboundRemote.getTracks()));
    };

    pc.onconnectionstatechange = () => setConnectionState(pc.connectionState);

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        const description = toSerializableDescription(pc.localDescription);
        if (description) {
          transport.send({ kind: "description", description, from: selfId });
        }
      } catch (err) {
        console.error("negotiation error", err);
      } finally {
        makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        transport.send({ kind: "candidate", candidate: candidate.toJSON(), from: selfId });
      }
    };

    return () => {
      transport.close();
      store.setDataChannel?.(code as string, null);
      pc.close();
      pcRef.current = null;
      setRemoteStream(null);
      setConnectionState("closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, selfId, polite, localStream]);

  return { remoteStream, connectionState };
}