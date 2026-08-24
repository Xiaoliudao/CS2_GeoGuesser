const PLAYER_ID_KEY = "cs2-guesser-player-id";
const NICKNAME_KEY = "cs2-guesser-nickname";

export function getPlayerId(): string {
  const existing = localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(PLAYER_ID_KEY, created);
  return created;
}

export function getNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) ?? "";
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname.trim());
}
