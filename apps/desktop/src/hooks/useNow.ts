import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs` (default: each minute, on the minute). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      // Line up with the next boundary so "now" markers move on the minute.
      timer = setTimeout(tick, intervalMs - (d.getTime() % intervalMs));
    };
    timer = setTimeout(tick, intervalMs - (Date.now() % intervalMs));
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}
