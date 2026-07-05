'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Popover flotante real: se renderiza en un portal sobre <body> con posición
// fija calculada desde el elemento disparador, así NINGÚN contenedor con
// overflow/scroll lo puede recortar (barras con scroll, celdas de tabla, etc).
// El contenedor padre del disparador debe ser `relative` (es el ancla).
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
  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = () => {
      const anchor = anchorRef.current?.parentElement
      const panel = panelRef.current
      if (!anchor || !panel) return
      const r = anchor.getBoundingClientRect()
      const pw = panel.offsetWidth
      const ph = panel.offsetHeight
      let left = align === 'right' ? r.right - pw : r.left
      left = Math.min(left, window.innerWidth - pw - 8)
      left = Math.max(left, 8)
      let top = r.bottom + 6
      if (top + ph > window.innerHeight - 8) {
        // no entra abajo: probar arriba; si tampoco, pegar al borde inferior
        const above = r.top - ph - 6
        top = above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8)
      }
      setPos({ top, left })
    }
    place()
    const ro = new ResizeObserver(place)
    if (panelRef.current) ro.observe(panelRef.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  if (!open) return null
  return (
    <>
      <span ref={anchorRef} className="hidden" />
      {createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div
            ref={panelRef}
            className={`popover fixed z-50 max-w-[94vw] animate-pop ${className}`}
            style={
              pos
                ? { top: pos.top, left: pos.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }
                : { top: -9999, left: -9999 }
            }
          >
            {children}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
