"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Frame } from "../../../components/ui/Frame";
import { StripLoader } from "../../../components/ui/StripLoader";
import { Button } from "../../../components/ui/Button";
import { store, useSession } from "../../../lib/store/useSession";
import { LobbyScreen } from "../../../components/screens/LobbyScreen";
import { TemplateVoteScreen } from "../../../components/screens/TemplateVoteScreen";
import { FormatSelectScreen } from "../../../components/screens/FormatSelectScreen";
import { CaptureScreen } from "../../../components/screens/CaptureScreen";
import { RetakeVoteScreen } from "../../../components/screens/RetakeVoteScreen";
import { FilterScreen } from "../../../components/screens/FilterScreen";
import { SharedViewScreen } from "../../../components/screens/SharedViewScreen";

export default function SessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();

  const [partnerId, setPartnerId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(`photobooth:partner:${code}`)
  );
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(partnerId == null);

  useEffect(() => {
    if (partnerId) return;
    let cancelled = false;
    store
      .joinSession(code)
      .then(({ partnerId: joined }) => {
        if (!cancelled) setPartnerId(joined);
      })
      .catch((err: Error) => {
        if (!cancelled) setJoinError(err.message);
      })
      .finally(() => {
        if (!cancelled) setJoining(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const { state, loaded, self, partner, isOwner } = useSession(code, partnerId);

  if (joining || (!joinError && !loaded)) {
    return (
      <Frame>
        <StripLoader label="connecting" />
      </Frame>
    );
  }

  if (joinError) {
    return (
      <Frame>
        <div className="flex flex-col items-center text-center gap-4">
          <p className="font-display text-xl text-paper">Couldn&apos;t join</p>
          <p className="text-mist text-sm">{joinError}</p>
          <Link href="/" className="w-full">
            <Button variant="secondary">Back to start</Button>
          </Link>
        </div>
      </Frame>
    );
  }

  if (!state || !self) {
    return (
      <Frame>
        <div className="flex flex-col items-center text-center gap-4">
          <p className="font-display text-xl text-paper">This session has ended</p>
          <p className="text-mist text-sm">
            The code expired or the session was closed. Start a new one.
          </p>
          <Link href="/" className="w-full">
            <Button>Back to start</Button>
          </Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      {state.step === "lobby" && <LobbyScreen state={state} isOwner={isOwner} />}
      {state.step === "template" && (
        <TemplateVoteScreen code={code} state={state} self={self} partner={partner} isOwner={isOwner} />
      )}
      {state.step === "format" && (
        <FormatSelectScreen code={code} state={state} self={self} partner={partner} isOwner={isOwner} />
      )}
      {state.step === "capture" && (
        <CaptureScreen code={code} state={state} self={self} partner={partner} isOwner={isOwner} />
      )}
      {state.step === "retake" && (
        <RetakeVoteScreen code={code} state={state} self={self} isOwner={isOwner} />
      )}
      {state.step === "filter" && <FilterScreen code={code} state={state} self={self} />}
      {state.step === "shared" && <SharedViewScreen state={state} />}
    </Frame>
  );
}
