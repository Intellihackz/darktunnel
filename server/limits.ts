// Plain in-memory limits per client. They stop one client from using the relay as a fire hose.
// Nothing is written to disk, and nothing about what was asked for is kept.
type Bucket = { start: number; count: number; open: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function bucket(key: string): Bucket {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) {
    b = { start: now, count: 0, open: b?.open ?? 0 };
    buckets.set(key, b);
  }
  return b;
}

/** Returns a release function, or null when the client is over its limit. */
export function take(key: string, perMinute: number, concurrent: number): (() => void) | null {
  const b = bucket(key);
  if (b.count >= perMinute || b.open >= concurrent) return null;
  b.count++;
  b.open++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    b.open = Math.max(0, b.open - 1);
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now - b.start > WINDOW_MS * 3 && b.open === 0) buckets.delete(k);
}, WINDOW_MS).unref();

// A rolling hourly budget of bytes sent back to one client. It keeps a single visitor from turning the relay
// into a free download pipe.
const spent = new Map<string, { start: number; bytes: number }>();
const HOUR = 3_600_000;
const BUDGET = Number(process.env.MAX_BYTES_PER_HOUR ?? 3 * 1024 ** 3);

// The onion site also has one budget for all visitors together (key "*"), because rotating window ids would otherwise dodge the per-window one.
const GLOBAL_BUDGET = Number(process.env.MAX_BYTES_PER_HOUR_ALL ?? 40 * 1024 ** 3);
export function overBudget(key: string): boolean {
  const e = spent.get(key);
  return !!e && Date.now() - e.start < HOUR && e.bytes >= (key === "*" ? GLOBAL_BUDGET : BUDGET);
}
export function spend(key: string, bytes: number) {
  const now = Date.now();
  let e = spent.get(key);
  if (!e || now - e.start >= HOUR) {
    e = { start: now, bytes: 0 };
    spent.set(key, e);
  }
  e.bytes += bytes;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of spent) if (now - e.start >= HOUR) spent.delete(k);
}, HOUR).unref();
