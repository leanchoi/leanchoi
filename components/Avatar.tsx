'use client';

// Shows the user's photo if they uploaded one, otherwise their initial
export default function Avatar({ userId, name, avatar, size = 28, className = '' }: {
  userId: number; name: string; avatar?: string | null; size?: number; className?: string;
}) {
  const initial = (name || '?').charAt(0).toUpperCase();
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/avatars/${userId}`}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      title={name}
      className={`rounded-full bg-brand flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {initial}
    </div>
  );
}
