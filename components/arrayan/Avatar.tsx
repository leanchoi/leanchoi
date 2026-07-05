'use client'

// Avatar del módulo Arrayán: foto de Trochi (/api/avatars/id) o iniciales
const PALETTE = [
  'bg-teal-700',
  'bg-blue-700',
  'bg-purple-700',
  'bg-pink-700',
  'bg-orange-700',
  'bg-green-700',
  'bg-cyan-700',
  'bg-rose-700',
]

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({
  name,
  avatar,
  userId,
  size = 28,
  className = '',
}: {
  name: string
  avatar?: string | null
  userId?: number | null
  size?: number
  className?: string
}) {
  const color = PALETTE[(name || '?').charCodeAt(0) % PALETTE.length]
  if (avatar && userId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatars/${userId}`}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${color} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4), color: '#fff' }}
    >
      {initials(name || '?')}
    </span>
  )
}
