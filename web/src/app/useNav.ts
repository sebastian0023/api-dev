import { useEffect, useState } from "react";
import { DEFAULT_SCREEN, isScreenId, type ScreenId } from "./screens.js";

function readHash(): ScreenId {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return isScreenId(raw) ? raw : DEFAULT_SCREEN;
}

export function screenHref(id: ScreenId): string {
  return `#/${id}`;
}

/** Hash-based routing: no dependency, deep-linkable, and survives refresh + back/forward for free. */
export function useNav(): { screen: ScreenId; navigate: (id: ScreenId) => void } {
  const [screen, setScreen] = useState<ScreenId>(() => readHash());

  useEffect(() => {
    const onHashChange = () => setScreen(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(id: ScreenId) {
    window.location.hash = screenHref(id);
  }

  return { screen, navigate };
}
