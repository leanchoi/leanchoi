'use client'

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8" onClick={onClose}>
      <div
        className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-5 my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="btn-ghost -mr-2 px-2 py-1 text-lg leading-none">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
