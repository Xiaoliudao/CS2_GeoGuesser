import { FormEvent, useState } from "react";
import { nicknameSchema, roomCodeSchema } from "../../shared/schemas";
import { navigate } from "../App";
import { getNickname, getPlayerId, saveNickname } from "../lib/identity";

export function HomePage() {
  const [nickname, setNickname] = useState(getNickname);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const validateNickname = (): string | null => {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError("Nickname must be between 2 and 20 characters.");
      return null;
    }
    saveNickname(parsed.data);
    getPlayerId();
    return parsed.data;
  };

  const createRoom = async () => {
    if (!validateNickname()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) throw new Error("Room creation failed");
      const data = (await response.json()) as { roomCode: string };
      navigate(`/room/${data.roomCode}`);
    } catch {
      setError("Could not create a room. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateNickname()) return;
    const parsed = roomCodeSchema.safeParse(roomCode);
    if (!parsed.success) {
      setError("Enter a valid 5-character room code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${parsed.data}`);
      if (response.status === 404) {
        setError("Room not found. Check the code and try again.");
        return;
      }
      if (!response.ok) throw new Error("Room lookup failed");
      navigate(`/room/${parsed.data}`);
    } catch {
      setError("Could not reach the game server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="home-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="home-card">
        <div className="eyebrow">REAL-TIME · TWO PLAYER</div>
        <h1>
          CS2 MAP
          <span>GUESSER</span>
        </h1>
        <p className="home-lead">Read the angle. Pinpoint the position. Beat the clock.</p>

        <label htmlFor="nickname">NICKNAME</label>
        <input
          id="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={20}
          placeholder="Your callsign"
          autoComplete="nickname"
        />
        <button className="primary-button" onClick={createRoom} disabled={busy}>
          {busy ? "CONNECTING…" : "CREATE ROOM"}
        </button>

        <div className="divider"><span>OR JOIN A SQUAD</span></div>
        <form onSubmit={joinRoom}>
          <label htmlFor="room-code">ROOM CODE</label>
          <input
            id="room-code"
            className="room-code-input"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            maxLength={5}
            placeholder="K7P2A"
            autoComplete="off"
          />
          <button className="secondary-button" type="submit" disabled={busy}>
            JOIN ROOM
          </button>
        </form>
        {error && <div className="form-error" role="alert">{error}</div>}
      </section>
    </main>
  );
}
