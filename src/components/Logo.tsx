export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#134e4a" />
      <path
        d="M32 10c-9 7-15 15-15 24 0 9 7 16 15 16s15-7 15-16c0-9-6-17-15-24z"
        fill="none"
        stroke="#2dd4bf"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M32 22v22M32 30l-7-5M32 38l8-6"
        stroke="#5eead4"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
