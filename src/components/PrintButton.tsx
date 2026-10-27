"use client";

/** Opens the browser's print dialog; the print styles in globals.css keep only the page content. */
export function PrintButton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`inline-flex items-center gap-2 print:hidden ${className}`}>
      <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M4 6V1.5h8V6M4 12H2.5A1 1 0 0 1 1.5 11V7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H12" />
        <path d="M4 9.5h8v5H4z" />
      </svg>
      {label}
    </button>
  );
}
