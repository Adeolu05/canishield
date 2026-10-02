"use client";

// "Can I send shielded ZEC to / Binance?" with the second line cycling through
// real service names. Screen readers get one static sentence; reduced motion
// (and the server render) shows "…this service?".
import { useEffect, useState, useSyncExternalStore } from "react";

const subscribeMotion = (cb: () => void) => {
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True when motion is allowed. The server assumes reduced motion, so it renders the static line. */
const useMotionOk = () =>
  useSyncExternalStore(
    subscribeMotion,
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

export function CyclingHeadline({ unit, names }: { unit: string; names: string[] }) {
  const motionOk = useMotionOk() && names.length > 1;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!motionOk) return;
    const id = setInterval(() => setI((n) => (n + 1) % names.length), 2500);
    return () => clearInterval(id);
  }, [motionOk, names.length]);

  return (
    <h1 className="text-balance text-[clamp(3rem,2rem+2.5vw,5rem)] font-semibold leading-[1.05] tracking-tight">
      <span className="sr-only">Can I send shielded {unit} to this service?</span>
      <span aria-hidden="true">
        <span className="block">Can I send shielded {unit} to</span>
        <span className="relative block h-[1.1em] overflow-hidden">
          {motionOk ? (
            <span key={i} className="zp-rise absolute inset-x-0 top-0 truncate text-accent-ink">
              {names[i]}?
            </span>
          ) : (
            <span className="absolute inset-x-0 top-0 text-muted">…this service?</span>
          )}
        </span>
      </span>
    </h1>
  );
}
