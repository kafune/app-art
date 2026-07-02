"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { DocStatus, DocumentType } from "@reformai/database"
import { DocumentStatusBadge } from "./DocumentStatusBadge"
import { DOCUMENT_TYPE_LABELS } from "./document-type-constants"
import { Icon, DocumentViewer } from "@/interfaces/components/ui"
import type { DocumentUploadZoneHandle } from "./DocumentUploadZone"
import { DocumentAnalysisPanel } from "./DocumentAnalysisPanel"
import { buildAnalysisView } from "./analysis-display"

export interface DocumentItem {
  id: string
  fileName: string
  type: DocumentType
  status: DocStatus
  uploadedAt: string
  version: number
  mimeType?: string
  /** Pendências estruturadas vindas da análise de IA */
  pendencies?: Record<string, unknown> | null
  /** Dados extraídos da análise de IA */
  extractedData?: Record<string, unknown> | null
  /** Inconsistências detectadas */
  inconsistencies?: Record<string, unknown> | null
}

interface ViewerState {
  open: boolean
  documentId: string
  mimeType: string
  fileName: string
}

const POLL_STATUSES: DocStatus[] = ["PENDING", "PROCESSING"]
const PROBLEM_STATUSES: DocStatus[] = ["INVALID", "VALID_WITH_CAVEATS"]

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

const STATUS_ICON: Record<DocStatus, { name: "check" | "clock" | "alert" | "close"; colorClass: string }> = {
  VALID:              { name: "check", colorClass: "text-green-700" },
  VALID_WITH_CAVEATS: { name: "alert", colorClass: "text-ochre-600" },
  PROCESSING:         { name: "clock", colorClass: "text-azulejo-600" },
  PENDING:            { name: "clock", colorClass: "text-ink-400" },
  INVALID:            { name: "close", colorClass: "text-iron-600" },
  MISSING:            { name: "alert", colorClass: "text-clay-500" },
}

const STATUS_ICON_BG: Record<DocStatus, string> = {
  VALID:              "bg-green-100",
  VALID_WITH_CAVEATS: "bg-ochre-100",
  PROCESSING:         "bg-azulejo-100",
  PENDING:            "bg-bone-200",
  INVALID:            "bg-iron-100",
  MISSING:            "bg-clay-100",
}

const DEFAULT_VIEWER: ViewerState = { open: false, documentId: "", mimeType: "", fileName: "" }

/** Individual document row with AI analysis accordion */
function DocumentRow({
  doc,
  onView,
  onNewVersion,
}: {
  doc: DocumentItem
  onView: (doc: DocumentItem) => void
  onNewVersion: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const iconCfg = STATUS_ICON[doc.status]
  const iconBg = STATUS_ICON_BG[doc.status]
  const isProcessing = POLL_STATUSES.includes(doc.status)
  const hasProblem = PROBLEM_STATUSES.includes(doc.status)
  // Análise da IA disponível para todo documento já processado (inclusive VÁLIDO).
  const analysis = isProcessing ? null : buildAnalysisView(doc)
  const canExpand = !!analysis && (analysis.hasContent || analysis.degraded)

  return (
    <li
      className="flex flex-col border-b border-divider last:border-b-0"
      data-testid="document-list-item"
    >
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 md:gap-x-3.5 md:px-5">
        {/* File type icon with optional pulse */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconBg} ${
            isProcessing ? "animate-pulse" : ""
          }`}
        >
          <Icon name="doc" size={18} className={iconCfg.colorClass} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-ink-900" title={doc.fileName}>
              {doc.fileName}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-caps text-ink-400">
              {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
            <Icon name={iconCfg.name} size={12} className={iconCfg.colorClass} />
            <span className="font-mono">{formatDate(doc.uploadedAt)}</span>
          </div>
          {/* Processing hint */}
          {isProcessing && (
            <p className="mt-1 text-[11px] italic text-azulejo-600">
              Aguarde, a IA está analisando…
            </p>
          )}
        </div>

        {/* Status badge — pulse wrapper for PENDING/PROCESSING */}
        <span className={isProcessing ? "animate-pulse" : ""}>
          <DocumentStatusBadge status={doc.status} />
        </span>

        {/* Expand toggle — abre a análise da IA de qualquer doc processado */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Ocultar análise da IA" : "Ver análise da IA"}
            className="flex h-7 cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1.5 text-[11px] font-medium text-green-700 transition-colors duration-150 hover:bg-bone-100 max-md:h-11"
            title={expanded ? "Ocultar análise" : "Ver análise da IA"}
            data-testid="document-analysis-toggle"
          >
            <Icon name="sparkle" size={13} />
            <span className="hidden sm:inline">{expanded ? "Ocultar" : "Análise"}</span>
          </button>
        )}

        {/* View button */}
        <button
          type="button"
          onClick={() => onView(doc)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-ink-400 transition-colors duration-150 hover:bg-bone-100 hover:text-ink-700 max-md:h-11 max-md:w-11"
          title="Visualizar"
          aria-label={`Visualizar ${doc.fileName}`}
        >
          <Icon name="eye" size={14} />
        </button>
      </div>

      {/* Accordion de análise da IA */}
      {canExpand && expanded && (
        <div
          className="mx-4 mb-3.5"
          role="region"
          aria-label="Análise da IA do documento"
        >
          <DocumentAnalysisPanel doc={doc} />

          {/* CTA de nova versão — apenas em docs com problema */}
          {hasProblem && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false)
                  onNewVersion()
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-ink-900 bg-transparent px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors duration-150 hover:bg-ink-900 hover:text-bone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              >
                <Icon name="upload" size={12} />
                Enviar nova versão
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function DocumentList({
  caseId,
  initialDocuments,
  uploadZoneRef,
}: {
  caseId: string
  initialDocuments: DocumentItem[]
  uploadZoneRef?: React.RefObject<DocumentUploadZoneHandle>
}) {
  const router = useRouter()
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments)
  const [viewer, setViewer] = useState<ViewerState>(DEFAULT_VIEWER)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Evita re-render (flicker) nos ticks do polling em que nada mudou
  const lastSnapshotRef = useRef("")

  const fetchDocs = useCallback(async () => {
    const res = await fetch(`/api/v1/cases/${caseId}/documents`, { cache: "no-store" })
    if (!res.ok) return
    const body = await res.json()
    const snap = JSON.stringify(body.documents ?? [])
    if (snap !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snap
      setDocuments(body.documents ?? [])
    }
  }, [caseId])

  useEffect(() => {
    // Reseed vindo do server (router.refresh): só aplica se realmente mudou,
    // para não "voltar no tempo" sobre a lista recém-buscada pelo polling.
    const snap = JSON.stringify(initialDocuments)
    if (snap !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snap
      setDocuments(initialDocuments)
    }
  }, [initialDocuments])

  useEffect(() => {
    const needsPolling = documents.some((d) => POLL_STATUSES.includes(d.status))
    if (!needsPolling) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
        // Análise terminou: atualiza as partes server-rendered da página
        // (status do caso, checklist e badge "em análise").
        router.refresh()
      }
      return
    }
    if (pollingRef.current) return
    // 3 s interval — faster feedback during AI processing
    pollingRef.current = setInterval(fetchDocs, 3000)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [documents, fetchDocs, router])

  function openViewer(doc: DocumentItem) {
    setViewer({
      open: true,
      documentId: doc.id,
      mimeType: doc.mimeType ?? "application/octet-stream",
      fileName: doc.fileName,
    })
  }

  function closeViewer() {
    setViewer(DEFAULT_VIEWER)
  }

  function handleNewVersion() {
    uploadZoneRef?.current?.scrollIntoView()
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-bone-400 p-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bone-200">
          <Icon name="doc" size={18} className="text-ink-500" />
        </div>
        <p className="text-sm text-ink-500">Nenhum documento enviado ainda.</p>
      </div>
    )
  }

  return (
    <>
      <DocumentViewer
        caseId={caseId}
        documentId={viewer.documentId}
        mimeType={viewer.mimeType}
        fileName={viewer.fileName}
        isOpen={viewer.open}
        onClose={closeViewer}
      />

      <div className="rounded-md bg-surface shadow-hair">
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h3 className="text-md font-semibold text-ink-900">Documentos do caso</h3>
          <span className="font-mono text-xs text-ink-400">
            {documents.length} arquivo{documents.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ul className="divide-y-0">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onView={openViewer}
              onNewVersion={handleNewVersion}
            />
          ))}
        </ul>
      </div>
    </>
  )
}
