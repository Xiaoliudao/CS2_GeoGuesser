import { type FormEvent, useEffect, useMemo, useState } from "react";
import { MAP_IDS } from "../../shared/maps";
import { RoomInvitePreviewSchema, type RoomInvitePreview, type RoomInviteUnavailableReason } from "../../shared/roomInvite";
import { nicknameSchema, roomCodeSchema } from "../../shared/schemas";
import { navigate } from "../App";
import { getNickname, getPlayerId } from "../lib/identity";
import { joinRoom } from "../lib/joinRoom";

type PageState =
  | { status: "checking" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "loaded"; preview: RoomInvitePreview };

const BLOCKED_COPY: Record<RoomInviteUnavailableReason, { title: string; message: string }> = {
  full: { title: "ROOM FULL", message: "This room already has two players." },
  in_progress: { title: "MATCH IN PROGRESS", message: "This match has already started." },
  expired: { title: "INVITE EXPIRED", message: "This match has finished and the room invite is no longer active." },
};

export function InviteJoinPage({ roomCode: rawRoomCode }: { roomCode: string }) {
  const parsedRoomCode = useMemo(() => roomCodeSchema.safeParse(rawRoomCode), [rawRoomCode]);
  const roomCode = parsedRoomCode.success ? parsedRoomCode.data : null;
  const [nickname, setNickname] = useState(getNickname);
  const [pageState, setPageState] = useState<PageState>({ status: "checking" });
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [blockedReason, setBlockedReason] = useState<RoomInviteUnavailableReason | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = robots?.content;
    if (robots) robots.content = "noindex, nofollow";
    return () => {
      if (robots && previous !== undefined) robots.content = previous;
    };
  }, []);

  useEffect(() => {
    if (!roomCode) {
      setPageState({ status: "invalid" });
      return;
    }
    if (window.location.pathname !== `/join/${roomCode}`) {
      window.history.replaceState({}, "", `/join/${roomCode}`);
    }
    const controller = new AbortController();
    setPageState({ status: "checking" });
    setJoinError("");
    void fetch(`/api/rooms/${roomCode}/preview`, {
      headers: { accept: "application/json", "x-cs2-player-id": getPlayerId() },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => null);
      const preview = RoomInvitePreviewSchema.safeParse(body);
      if (!preview.success) throw new Error("INVALID_PREVIEW");
      if (!controller.signal.aborted) setPageState({ status: "loaded", preview: preview.data });
    }).catch(() => {
      if (!controller.signal.aborted) setPageState({ status: "error" });
    });
    return () => controller.abort();
  }, [retryKey, roomCode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!roomCode || !nicknameSchema.safeParse(nickname).success) return;
    setBusy(true);
    setJoinError("");
    const result = await joinRoom({ roomCode, nickname });
    setBusy(false);
    if (result.ok) {
      navigate(`/room/${result.roomCode}`);
      return;
    }
    if (result.code === "not_found") {
      setPageState({ status: "invalid" });
      return;
    }
    if (result.code === "full" || result.code === "in_progress" || result.code === "expired") {
      setBlockedReason(result.code);
      return;
    }
    setJoinError(result.message);
  };

  const backButton = <button className="secondary-button invite-back-button" type="button" onClick={() => navigate("/")}>BACK TO HOME</button>;
  let content;
  if (pageState.status === "checking") {
    content = <div className="invite-state"><div className="spinner" /><h1>CHECKING ROOM…</h1><p>Confirming that this invite is still available.</p></div>;
  } else if (pageState.status === "invalid" || (pageState.status === "loaded" && !pageState.preview.exists)) {
    content = <div className="invite-state"><div className="stage-kicker">INVITE UNAVAILABLE</div><h1>ROOM NOT FOUND</h1><p>This room may have expired or the invite link is invalid.</p>{backButton}</div>;
  } else if (pageState.status === "error") {
    content = <div className="invite-state"><div className="stage-kicker">CONNECTION CHECK</div><h1>ROOM CHECK FAILED</h1><p>We could not verify this invite. Check your connection and try again.</p><button className="primary-button" type="button" onClick={() => setRetryKey((key) => key + 1)}>TRY AGAIN</button>{backButton}</div>;
  } else {
    const preview = pageState.preview;
    const reason = blockedReason ?? (preview.exists && !preview.joinable ? preview.reason : null);
    if (reason) {
      const blocked = BLOCKED_COPY[reason];
      content = <div className="invite-state"><div className="stage-kicker">INVITE UNAVAILABLE</div><h1>{blocked.title}</h1><p>{blocked.message}</p>{backButton}</div>;
    } else if (preview.exists) {
      const settings = preview.settings;
      content = (
        <>
          <div className="stage-kicker">{preview.reconnectable ? "WELCOME BACK" : "YOU'VE BEEN INVITED"}</div>
          <h1>JOIN ROOM</h1>
          <div className="invite-room-code"><span>ROOM</span><strong>{preview.roomCode}</strong></div>
          <div className="invite-settings" aria-label="Room settings preview">
            <span>{settings.totalRounds} ROUNDS</span>
            <span>{settings.roundDurationSeconds} SEC</span>
            <span>{settings.mapCount === MAP_IDS.length ? "ALL MAPS" : `${settings.mapCount} MAPS`}</span>
            <span>{settings.serverRegion === "asia" ? "ASIA" : "AUTO"}</span>
          </div>
          <form className="invite-join-form" onSubmit={(event) => void submit(event)}>
            <label htmlFor="invite-nickname">NICKNAME</label>
            <input id="invite-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="Your callsign" autoComplete="nickname" autoFocus />
            <button className="primary-button" type="submit" disabled={busy || !nicknameSchema.safeParse(nickname).success}>
              {busy ? "JOINING…" : preview.reconnectable ? "RECONNECT TO ROOM" : "JOIN ROOM"}
            </button>
          </form>
          {joinError && <div className="form-error" role="alert">{joinError}</div>}
          {backButton}
        </>
      );
    }
  }

  return (
    <main className="invite-shell">
      <button className="wordmark invite-wordmark" type="button" onClick={() => navigate("/")}>CS2 <span>MG</span></button>
      <section className="stage-card invite-card">{content}</section>
    </main>
  );
}
