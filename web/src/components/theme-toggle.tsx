"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const KEY = "zp-theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const EVENT = "zp-theme-change";

function readTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

function setTheme(t: Theme) {
  const root = document.documentElement;
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  window.dispatchEvent(new Event(EVENT));
}

const LABEL: Record<Theme, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };
const ICON = { system: Monitor, light: Sun, dark: Moon };

/** Cycles System → Light → Dark. The inline script in the root layout applies the choice before paint. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`${LABEL[theme]} · click for ${LABEL[next].toLowerCase()}`}
      className="grid size-8 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}

/** Runs in <head> before paint: applies a saved light/dark choice; no attribute means "system". */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
