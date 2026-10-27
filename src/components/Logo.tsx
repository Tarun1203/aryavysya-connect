/** The banyan mark: a vamsha vruksham in a kumkum-to-turmeric medallion. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c2401f" />
          <stop offset="1" stopColor="#e0a114" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#logo-g)" />
      <circle cx="20" cy="20" r="16.5" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".8" />
      {/* canopy */}
      <g fill="#fff">
        <circle cx="20" cy="12.5" r="4.2" />
        <circle cx="14" cy="15" r="3.4" />
        <circle cx="26" cy="15" r="3.4" />
        <circle cx="11.5" cy="20" r="2.4" />
        <circle cx="28.5" cy="20" r="2.4" />
      </g>
      {/* trunk, branches and roots */}
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeWidth="1.8">
        <path d="M20 31V16" />
        <path d="M20 22c-2.5-1-4.5-3-6-6M20 22c2.5-1 4.5-3 6-6M20 26c-3-.5-6.5-2.5-8.5-6M20 26c3-.5 6.5-2.5 8.5-6" strokeWidth="1.3" />
        <path d="M14 32.5c2-1 4-1.5 6-1.5s4 .5 6 1.5" strokeWidth="1.3" />
      </g>
    </svg>
  );
}
