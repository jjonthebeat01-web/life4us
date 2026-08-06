# Synced Photobooth

Local-mock implementation of the spec: all 8 screens, the shared vote→confirm
pattern, synced countdown + full-res local capture, retake voting, live
filter preview, and the final composited strip.

## Run it

```bash
npm install
npm run dev
```

Open **two browser tabs** (or two windows) at `http://localhost:3000`.
Two tabs = two partners, synced live via `BroadcastChannel` + `localStorage`
— no backend, no account, nothing to configure.

## How to test the full flow

1. **Tab A**: click "Create a session" → note the 5-character code, land on Lobby.
2. **Tab B**: go to `localhost:3000`, enter that code under "Have a code" → both tabs move off the lobby automatically once connected.
3. **Template vote**: in both tabs, tap templates. Pick *different* ones first to confirm the "picks don't match" state, then both pick the same one. The confirm button only works in the tab that's the **owner** (the tab that created the session) — the other tab shows it disabled with a "waiting on [owner]" label.
4. **Format select**: same pattern, pick a strip length.
5. **Capture**: each tab will prompt for camera permission — allow it in both. Either tab can tap "Start countdown"; both tabs count 3-2-1 with a synced beep and each captures its **own** camera frame. Repeats until the strip is full.
6. **Retake vote**: tap a shot in *both* tabs to cast two votes — the retake button unlocks and only the owner tab can confirm it. Tapping "Continue to filter" (also owner-gated) skips retakes.
7. **Filter**: tap any filter in either tab — both update instantly, no confirm needed.
8. **Shared view**: both tabs land on the same finished strip with Download / Share / Save.

## Edge cases you can force manually

- **Owner disconnect → auto-transfer**: close the owner's tab mid-lobby (before both are captured is fine too) and wait ~20s; the remaining tab's `partners` list will show ownership flip. (Grace period constant: `OWNER_GRACE_PERIOD_MS` in `lib/types.ts`.)
- **Resume by code**: refresh a tab mid-session — it resumes at the current step using the partner id cached in that tab's `sessionStorage`. Opening the same code in a genuinely new tab joins as a new/rejoining partner instead (since `sessionStorage` is per-tab — this is a mock-only quirk, see note below).
- **Idle lobby expiry**: create a session and don't join a second partner; after 10 minutes (`LOBBY_IDLE_TIMEOUT_MS`) the code stops resolving.

## Architecture — what's mocked vs. real

| Piece | This build | Swap-in for production |
|---|---|---|
| Session/vote/lobby state | `lib/store/localMockStore.ts` — `BroadcastChannel` + `localStorage`, implements the `SessionStore` interface in `lib/store/types.ts` | An `AppSyncStore` implementing the same interface, backed by AppSync + DynamoDB |
| Camera capture | Real `getUserMedia`, works as-is | No change needed |
| Live video preview between partners | Real `RTCPeerConnection` (`lib/webrtc/usePeerConnection.ts`), signaled over `BroadcastChannel` | Same file, just swap the signaling channel for whatever your real backend uses to relay SDP/ICE (a GraphQL subscription, a WS relay, etc.) |
| Photo storage | Kept in-memory as data URLs in session state | Upload captured frames to S3 (or Supabase Storage) instead of embedding as data URLs |
| Auth | None (matches spec — code is the access control) | No change needed |

Because every screen talks only to the `SessionStore` interface, moving to
AppSync is a matter of writing one new file and changing one import in
`lib/store/useSession.ts` — no screen code changes.

## Known local-testing limitations (not production gaps)

- **Same-tab-only partner identity**: the mock remembers "who am I in this
  session" in `sessionStorage`, which is scoped per browser tab. That's exactly
  right for two-tabs-on-one-machine testing, but isn't how identity would work
  for two real devices — a real backend would key identity off of an
  auth-less device token stored in `localStorage`/a cookie instead.
- **Countdown sync precision**: both tabs start their local 3-2-1 timer when
  they receive the same `countdownSeed` broadcast, which is near-instant on
  one machine. Real cross-device sync would want a small NTP-style clock-offset
  correction to stay tight over a real network — not implemented here since it
  can't be meaningfully tested locally.
- **WebRTC signaling** goes over `BroadcastChannel`, which only reaches other
  tabs in the *same browser on the same machine*. It will not connect two
  different devices until it's wired to a real signaling channel (see table
  above) — this is expected, not a bug.

## Project structure

```
app/
  page.tsx                 Start screen (create/join)
  s/[code]/page.tsx         Flow controller — reads session step, renders matching screen
  globals.css                Design tokens (color, type, focus styles)
lib/
  types.ts                   Domain model
  content.ts                  Templates / formats / filters data
  store/
    types.ts                    SessionStore interface
    localMockStore.ts           Local mock implementation
    useSession.ts                React hook binding screens to the store
  webrtc/
    useLocalCamera.ts
    usePeerConnection.ts
components/
  ui/                         Frame, Button, Avatar, ConfirmBar, StripLoader
  screens/                    One component per screen in the flow
```
