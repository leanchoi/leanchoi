'use client'

import { useEffect, useId, useRef } from 'react'

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  sheetOnMobile = false,
  bare = false,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  wide?: boolean
  /**
   * En teléfono se presenta como hoja pegada al borde inferior, con el alto casi
   * completo, en lugar de una tarjeta flotando en el medio. El pulgar llega a la
   * parte de abajo, que es donde va lo accionable.
   */
  sheetOnMobile?: boolean
  /** El componente se encarga de su propio encabezado y padding */
  bare?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Para devolver el foco a donde estaba al cerrar
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((el) => el.offsetParent !== null)

    // Foco inicial dentro del diálogo
    const first = focusable()[0]
    ;(first || panelRef.current)?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // Trampa de foco: sin esto, Tab se escapaba al fondo de la página
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const shell = sheetOnMobile
    ? `card w-full ${wide ? 'max-w-3xl' : 'max-w-md'}
       max-h-[92vh] rounded-b-none sm:max-h-[88vh] sm:rounded-b-surface
       flex flex-col overflow-hidden`
    : `card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} my-auto`

  return (
    <div
      className={`fixed inset-0 z-50 flex overflow-y-auto bg-surface-void/80 backdrop-blur-sm ${
        sheetOnMobile
          ? 'items-end justify-center p-0 sm:items-center sm:p-6'
          : 'items-start justify-center p-4 sm:p-8'
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`${shell} ${bare ? '' : 'p-5'} animate-rise`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Agarradera: la señal de "esto se desliza" que espera un teléfono */}
        {sheetOnMobile && (
          <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-ink-lo/40" />
          </div>
        )}
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button onClick={onClose} aria-label="Cerrar" className="btn-icon">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
