import { useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { QuestionEditorPage } from "./pages/QuestionEditorPage";

function currentPath(): string {
  return window.location.pathname;
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const handleNavigation = () => setPath(currentPath());
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  const roomMatch = path.match(/^\/room\/([A-HJ-NP-Z2-9]{5})\/?$/i);
  if (import.meta.env.DEV && path === "/dev/question-editor") return <QuestionEditorPage />;
  if (roomMatch) return <RoomPage roomCode={roomMatch[1].toUpperCase()} />;
  return <HomePage />;
}
