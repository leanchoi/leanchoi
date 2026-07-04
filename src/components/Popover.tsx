'use client'

// Popover real: overlay que captura clicks afuera + panel posicionado.
// El contenedor padre debe ser `relative`.
export default function Popover({
  open,
  onClose,
  children,
  className = '',
  align = 'left',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  align?: 'left' | 'right'
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className={`popover absolute top-full mt-1 ${
          align === 'right' ? 'right-0' : 'left-0'
        } ${className}`}
      >
        {children}
      </div>
    </>
  )
}
