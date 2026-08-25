import { lazy, Suspense, useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { InviteJoinPage } from "./pages/InviteJoinPage";
import { RoomPage } from "./pages/RoomPage";

const DevQuestionEditorPage = import.meta.env.DEV
  ? lazy(() => import("./pages/QuestionEditorPage").then((module) => ({ default: module.QuestionEditorPage })))
  : null;
const AdminQuestionEditorPage = lazy(() => import("./pages/AdminQuestionEditorPage").then((module) => ({ default: module.AdminQuestionEditorPage })));

function NotFoundPage() {
  return (
    <main className="not-found-page">
      <section className="stage-card">
        <div className="stage-kicker">404 · LOCATION UNKNOWN</div>
        <h1>PAGE NOT FOUND</h1>
        <p>The requested location is not part of this match.</p>
        <button className="primary-button" type="button" onClick={() => navigate("/")}>RETURN HOME</button>
      </section>
    </main>
  );
}

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
  const inviteMatch = path.match(/^\/join\/([^/]+)\/?$/i);
  if (DevQuestionEditorPage && path === "/dev/question-editor") {
    return <Suspense fallback={null}><DevQuestionEditorPage /></Suspense>;
  }
  if (path === "/admin/question-editor" || path === "/admin/question-editor/") {
    return <Suspense fallback={null}><AdminQuestionEditorPage /></Suspense>;
  }
  if (roomMatch) return <RoomPage roomCode={roomMatch[1].toUpperCase()} />;
  if (inviteMatch) return <InviteJoinPage roomCode={inviteMatch[1]} />;
  if (path === "/") return <HomePage />;
  return <NotFoundPage />;
}
