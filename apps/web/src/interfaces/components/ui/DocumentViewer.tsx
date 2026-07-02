"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "./Icon"
import { Button } from "./Button"

export interface DocumentViewerProps {
  caseId: string
  documentId: string
  mimeType: string
  fileName: string
  isOpen: boolean
  onClose: () => void
}

function useDocumentSignedUrl(caseId: string, documentId: string, isOpen: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setUrl(null)
      setError(null)
      return
    }
    setLoading(true)
    setUrl(null)
    setError(null)
    fetch(`/api/v1/cases/${caseId}/documents/${documentId}/url`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Erro ao obter link (${r.status})`)
        const data = await r.json()
        if (!data?.url) throw new Error("URL não retornada")
        setUrl(data.url as string)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      })
      .finally(() => setLoading(false))
  }, [caseId, documentId, isOpen])

  return { url, loading, error }
}

function isPdf(mimeType: string) {
  return mimeType === "application/pdf"
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/")
}

export function DocumentViewer({
  caseId,
  documentId,
  mimeType,
  fileName,
  isOpen,
  onClose,
}: DocumentViewerProps) {
  const { url, loading, error } = useDocumentSignedUrl(caseId, documentId, isOpen)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  // Prevent body scroll when open
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

  if (!isOpen) return null

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizar: ${fileName}`}
    >
      {/* Modal */}
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface shadow-3">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-divider px-5 py-3.5">
          <Icon name="doc" size={16} className="shrink-0 text-ink-500" />
          <span
            className="flex-1 truncate text-sm font-medium text-ink-900"
            title={fileName}
          >
            {fileName}
          </span>

          {/* Download button (always visible) */}
          {url && (
            <a
              href={url}
              download={fileName}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong px-3 text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-bone-200"
              aria-label={`Baixar ${fileName}`}
            >
              <Icon name="upload" size={12} className="rotate-180" />
              Baixar
            </a>
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-400 transition-colors duration-150 hover:bg-bone-200 hover:text-ink-900 max-md:h-11 max-md:w-11"
            aria-label="Fechar visualizador"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-auto bg-bone-50">
          {loading && (
            <div className="flex h-[75vh] items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-ink-400">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-2 border-bone-300 border-t-green-700"
                  aria-hidden="true"
                />
                <p className="text-sm">Carregando documento…</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex h-[75vh] items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-clay-100">
                  <Icon name="alert" size={20} className="text-clay-600" />
                </div>
                <p className="text-sm font-medium text-ink-900">
                  Não foi possível carregar o documento
                </p>
                <p className="text-xs text-ink-500">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && url && isPdf(mimeType) && (
            <iframe
              src={url}
              title={fileName}
              className="h-[75vh] w-full rounded-none border-0"
              loading="lazy"
            />
          )}

          {!loading && !error && url && isImage(mimeType) && (
            <div className="flex min-h-[75vh] items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={fileName}
                className="max-h-[75vh] w-auto rounded object-contain shadow-hair"
                draggable={false}
              />
            </div>
          )}

          {!loading && !error && url && !isPdf(mimeType) && !isImage(mimeType) && (
            <div className="flex h-[75vh] items-center justify-center p-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bone-200">
                  <Icon name="doc" size={24} className="text-ink-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    Tipo não suportado para preview
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    <span className="font-mono">{mimeType}</span>
                  </p>
                </div>
                <a
                  href={url}
                  download={fileName}
                  className="inline-flex h-9 items-center gap-2 rounded-sm border border-ink-900 px-4 text-sm font-medium text-ink-900 transition-colors duration-150 hover:bg-ink-900 hover:text-bone-50"
                >
                  <Icon name="upload" size={14} className="rotate-180" />
                  Baixar arquivo
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
