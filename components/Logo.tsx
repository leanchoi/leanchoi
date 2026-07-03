// TROCHI mark: an outlined "T" whose crossbar merges into the stem
// with a road-like curve (the "trocha"), plus an inner lane line.
export default function Logo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="4.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M 22 16 L 78 16 L 78 28 L 57 28 L 57 84 L 43 84 L 43 46 C 43 36 35 28 22 28 Z" />
      <path d="M 61 16 C 55 27 48 31 48 44" strokeWidth="3.5" opacity="0.85" />
    </svg>
  );
}
