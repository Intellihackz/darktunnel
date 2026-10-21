export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="mark">
      <rect x="14" y="10" width="36" height="44" fill="none" stroke="currentColor" strokeWidth="4" />
      <rect x="14" y="26" width="36" height="12" fill="currentColor" />
    </svg>
  );
}

export function Frame({ home }: { home: boolean }) {
  return (
    <header className="frame">
      <a className="brand" href={home ? "#top" : "/"} aria-label="Dark Tunnel, top of page">
        <Mark />
        <span className="u">dark tunnel</span>
      </a>
      <a className="chip chip-link" href="/app">
        <i aria-hidden="true" /> Open the app
      </a>
    </header>
  );
}
