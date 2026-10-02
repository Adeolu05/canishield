"use client";

// ⌘K / Ctrl+K: search services and jump around. Native <dialog> gives focus
// trapping, Esc and focus return; the input is an ARIA combobox over a listbox.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Braces, CornerDownLeft, FlaskConical, LayoutGrid, Search, Send, Store } from "lucide-react";

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  /** Plain navigation outside the app (e.g. the JSON API). */
  external?: boolean;
  group: "Jump to" | "Services";
  icon: typeof Search;
  keywords?: string;
}

const ACTIONS: Item[] = [
  { id: "a-board", label: "Mainnet board", href: "/", group: "Jump to", icon: LayoutGrid, keywords: "home results" },
  { id: "a-testnet", label: "Testnet board", href: "/testnet", group: "Jump to", icon: FlaskConical, keywords: "taz rehearsal" },
  { id: "a-test", label: "Run a test", hint: "mainnet", href: "/test", group: "Jump to", icon: Send, keywords: "start new" },
  { id: "a-test-t", label: "Run a test", hint: "testnet", href: "/testnet/test", group: "Jump to", icon: Send, keywords: "start new taz" },
  { id: "a-api", label: "Results API", hint: "JSON", href: "/api/results.json", external: true, group: "Jump to", icon: Braces, keywords: "export data json" },
];

interface ExportService {
  slug: string;
  name: string;
  kind: string;
  readiness: string;
}

const READINESS_HINT: Record<string, string> = {
  ironwood: "Verified Ironwood",
  shielded_other: "Shielded, not Ironwood",
  transparent_only: "Transparent only",
  rejected: "Rejected",
  untested: "Untested",
};

async function loadServices(): Promise<Item[]> {
  const fetchOne = async (network: "mainnet" | "testnet") => {
    const r = await fetch(`/api/results.json${network === "testnet" ? "?network=testnet" : ""}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { services: ExportService[] };
    return j.services.map<Item>((s) => ({
      id: `s-${network}-${s.slug}`,
      label: s.name,
      hint: `${network === "testnet" ? "Testnet · " : ""}${READINESS_HINT[s.readiness] ?? s.kind}`,
      href: `${network === "testnet" ? "/testnet" : ""}/services/${s.slug}`,
      group: "Services",
      icon: Store,
      keywords: `${s.slug} ${s.kind} ${network}`,
    }));
  };
  const [m, t] = await Promise.all([fetchOne("mainnet"), fetchOne("testnet")]);
  return [...m, ...t];
}

const noSubscribe = () => () => {};
const useShortcutLabel = () =>
  useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "Ctrl K",
  );

export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [services, setServices] = useState<Item[] | null>(null);
  const listId = useId();
  const shortcut = useShortcutLabel();

  const open = useCallback(() => {
    const d = dialog.current;
    if (!d || d.open) return;
    setQuery("");
    setActive(0);
    d.showModal();
    input.current?.focus();
    if (!services) loadServices().then(setServices, () => setServices([]));
  }, [services]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...ACTIONS, ...(services ?? [])];
    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(q));
  }, [query, services]);

  const go = (item: Item) => {
    dialog.current?.close();
    if (item.external) window.location.assign(item.href);
    else router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(results.length - 1);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  // Keep the active option in view.
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  let lastGroup = "";
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        aria-label={`Search and jump (${shortcut})`}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-2 text-xs text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
      >
        <Search aria-hidden="true" className="size-4" />
        <kbd className="hidden font-mono text-[11px] tracking-tight sm:inline">{shortcut}</kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="Search services and pages"
        onClose={() => setQuery("")}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close(); // click on the backdrop
        }}
        className="zp-fade m-0 mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-foreground shadow-card backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search aria-hidden="true" className="size-4 text-subtle" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label="Search services and pages"
            placeholder="Search services, or jump to…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <kbd className="hidden rounded border border-line px-2 py-0.5 font-mono text-[11px] text-subtle sm:inline">Esc</kbd>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((item, i) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.id} role="presentation">
                {heading && (
                  <div aria-hidden="true" className="px-2 pb-1 pt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors duration-150 ${
                    i === active ? "bg-surface-2 text-foreground" : "text-muted"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-subtle" />
                  <span className="font-medium text-foreground">{item.label}</span>
                  {item.hint && <span className="truncate text-xs text-subtle">{item.hint}</span>}
                  {i === active && <CornerDownLeft aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-subtle" />}
                </div>
              </li>
            );
          })}
          {results.length === 0 && (
            <li role="presentation" className="px-2 py-6 text-center text-sm text-muted">
              {services === null ? "Loading services…" : `Nothing matches “${query.trim()}”.`}
            </li>
          )}
        </ul>
        <p aria-live="polite" className="sr-only">
          {results.length} result{results.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-subtle">
          <span>↑ ↓ to move · Enter to open</span>
          <span className="inline-flex items-center gap-1">
            Open with <kbd className="font-mono">{shortcut}</kbd> <ArrowRight aria-hidden="true" className="size-3" />
          </span>
        </div>
      </dialog>
    </>
  );
}
