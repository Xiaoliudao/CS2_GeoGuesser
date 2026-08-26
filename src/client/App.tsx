import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HomePage } from "./pages/HomePage";
import { InviteJoinPage } from "./pages/InviteJoinPage";
import { RoomPage } from "./pages/RoomPage";

const DevQuestionEditorPage = import.meta.env.DEV
  ? lazy(() => import("./pages/QuestionEditorPage").then((module) => ({ default: module.QuestionEditorPage })))
  : null;
const AdminQuestionEditorPage = lazy(() => import("./pages/AdminQuestionEditorPage").then((module) => ({ default: module.AdminQuestionEditorPage })));
const SoloPage = lazy(() => import("./pages/SoloPage").then((module) => ({ default: module.SoloPage })));

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

function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export interface NavigationAttempt {
  path: string;
  source: "push" | "pop";
}

export type NavigationBlocker = (attempt: NavigationAttempt) => boolean;

export interface NavigateOptions {
  bypassBlocker?: boolean;
  replace?: boolean;
}

let navigationBlocker: NavigationBlocker | null = null;
const syntheticNavigationEvents = new WeakSet<Event>();

export function registerNavigationBlocker(blocker: NavigationBlocker): () => void {
  navigationBlocker = blocker;
  return () => {
    if (navigationBlocker === blocker) navigationBlocker = null;
  };
}

function normalizedRoute(path: string): string {
  const url = new URL(path, window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function navigate(path: string, options: NavigateOptions = {}): boolean {
  const nextPath = normalizedRoute(path);
  if (!options.bypassBlocker && navigationBlocker?.({ path: nextPath, source: "push" })) {
    return false;
  }

  const historyMethod = options.replace ? "replaceState" : "pushState";
  window.history[historyMethod]({}, "", path);
  const navigationEvent = new PopStateEvent("popstate", { state: window.history.state });
  syntheticNavigationEvents.add(navigationEvent);
  window.dispatchEvent(navigationEvent);
  return true;
}

export function App() {
  const [path, setPath] = useState(currentPath);
  const committedRouteRef = useRef(currentRoute());
  const committedHistoryStateRef = useRef<unknown>(window.history.state);

  useEffect(() => {
    const handleNavigation = (event: PopStateEvent) => {
      const nextPath = currentRoute();
      if (
        !syntheticNavigationEvents.has(event)
        && navigationBlocker?.({ path: nextPath, source: "pop" })
      ) {
        window.history.pushState(
          committedHistoryStateRef.current,
          "",
          committedRouteRef.current,
        );
        return;
      }

      committedRouteRef.current = nextPath;
      committedHistoryStateRef.current = window.history.state;
      setPath(currentPath());
    };
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
  if (path === "/solo" || path === "/solo/") {
    return <Suspense fallback={null}><SoloPage /></Suspense>;
  }
  if (roomMatch) return <RoomPage roomCode={roomMatch[1].toUpperCase()} />;
  if (inviteMatch) return <InviteJoinPage roomCode={inviteMatch[1]} />;
  if (path === "/") return <HomePage />;
  return <NotFoundPage />;
}
