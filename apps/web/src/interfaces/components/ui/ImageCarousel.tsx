"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "./Icon"

export interface CarouselImage {
  key: string
  caption?: string
}

export interface ImageCarouselProps {
  images: CarouselImage[]
  isOpen: boolean
  onClose: () => void
  initialIndex?: number
}

export function ImageCarousel({
  images,
  isOpen,
  onClose,
  initialIndex = 0,
}: ImageCarouselProps) {
  const [current, setCurrent] = useState(initialIndex)
  const overlayRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)

  // Reset to initialIndex when opened
  useEffect(() => {
    if (isOpen) setCurrent(initialIndex)
  }, [isOpen, initialIndex])

  const goNext = useCallback(() => {
    setCurrent((i) => (i + 1) % images.length)
  }, [images.length])

  const goPrev = useCallback(() => {
    setCurrent((i) => (i - 1 + images.length) % images.length)
  }, [images.length])

  // Keyboard navigation + Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft") goPrev()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, goNext, goPrev])

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen || images.length === 0) return null

  const image = images[current]
  const hasMany = images.length > 1

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose()
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return // ignore tiny swipes
    if (dx < 0) goNext()
    else goPrev()
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Galeria de fotos"
    >
      {/* Modal */}
      <div
        className="relative flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-ink-900"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="font-mono text-xs text-white/60">
            {current + 1} / {images.length}
          </span>
          {image?.caption && (
            <span className="truncate px-4 text-xs text-white/80" title={image.caption}>
              {image.caption}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-white/60 transition-colors duration-150 hover:bg-white/10 hover:text-white max-md:h-11 max-md:w-11"
            aria-label="Fechar galeria"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Image area */}
        <div className="relative flex flex-1 items-center justify-center bg-ink-900 p-4">
          {/* Prev button */}
          {hasMany && (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition-colors duration-150 hover:bg-black/60 disabled:opacity-30 max-md:h-11 max-md:w-11"
              aria-label="Foto anterior"
            >
              <Icon name="arrowL" size={16} />
            </button>
          )}

          {/* Image */}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.key}
              alt={image.caption ?? `Foto ${current + 1}`}
              className="max-h-[70vh] max-w-full rounded object-contain"
              draggable={false}
              key={image.key} // forces re-render on slide change
            />
          )}

          {/* Next button */}
          {hasMany && (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition-colors duration-150 hover:bg-black/60 disabled:opacity-30 max-md:h-11 max-md:w-11"
              aria-label="Próxima foto"
            >
              <Icon name="arrow" size={16} />
            </button>
          )}
        </div>

        {/* Dot indicators */}
        {hasMany && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 py-3">
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrent(idx)}
                className={`h-2 rounded-full transition-all duration-200 ${
                  idx === current
                    ? "w-5 bg-white"
                    : "w-2 bg-white/30 hover:bg-white/60"
                }`}
                aria-label={`Ir para foto ${idx + 1}`}
                aria-current={idx === current}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
