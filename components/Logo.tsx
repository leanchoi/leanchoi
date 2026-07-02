// Abstract steam locomotive mark: boiler + cab, chimney with steam swirls, two wheels on a rail
export default function Logo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* steam */}
      <path d="M13 13c0-3 3-3 3-6" opacity="0.9" />
      <path d="M20 11c0-2.5 2.5-2.5 2.5-5" opacity="0.55" />
      {/* chimney */}
      <path d="M13 18v-1" />
      {/* boiler */}
      <rect x="6" y="18" width="24" height="13" rx="6.5" />
      {/* cab */}
      <path d="M30 31V13h9v18" />
      {/* wheels */}
      <circle cx="14" cy="36" r="3.5" />
      <circle cx="31" cy="36" r="3.5" />
      {/* rail */}
      <path d="M4 43h40" />
    </svg>
  );
}
