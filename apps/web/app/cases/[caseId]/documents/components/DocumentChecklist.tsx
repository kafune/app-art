import type { DocStatus, DocumentType } from "@reformai/database"
import { Icon } from "@/interfaces/components/ui"
import { DOCUMENT_TYPE_LABELS } from "./document-type-constants"
import { cn } from "@/shared/cn"

interface ChecklistItem {
  type: DocumentType
  required: boolean
  /** Actual status from uploaded docs, or undefined if not uploaded */
  docStatus?: DocStatus
}

interface Props {
  requiresART: boolean
  /** Map of doc type → status for already-uploaded documents */
  uploadedByType: Partial<Record<DocumentType, DocStatus>>
  /** Whether the case is in PENDING_CORRECTIONS — highlights INVALID items */
  pendingCorrections: boolean
}

const CHECKLIST_ICON: Record<string, { icon: "check" | "clock" | "alert" | "close" | "minus"; color: string; bg: string }> = {
  uploaded_valid:   { icon: "check",  color: "text-green-700",   bg: "bg-green-100" },
  uploaded_caveats: { icon: "alert",  color: "text-ochre-600",   bg: "bg-ochre-100" },
  uploaded_invalid: { icon: "close",  color: "text-iron-600",    bg: "bg-iron-100"  },
  uploaded_proc:    { icon: "clock",  color: "text-azulejo-600", bg: "bg-azulejo-100" },
  missing_required: { icon: "close",  color: "text-iron-500",    bg: "bg-iron-50"   },
  missing_optional: { icon: "minus",  color: "text-ink-400",     bg: "bg-bone-200"  },
}

type ChecklistIconKey = keyof typeof CHECKLIST_ICON

function resolveIconKey(docStatus: DocStatus | undefined, required: boolean): ChecklistIconKey {
  if (!docStatus) return required ? "missing_required" : "missing_optional"
  if (docStatus === "VALID") return "uploaded_valid"
  if (docStatus === "VALID_WITH_CAVEATS") return "uploaded_caveats"
  if (docStatus === "INVALID") return "uploaded_invalid"
  if (docStatus === "PROCESSING" || docStatus === "PENDING") return "uploaded_proc"
  return required ? "missing_required" : "missing_optional"
}

const STATUS_LABELS: Partial<Record<DocStatus, string>> = {
  VALID:              "válido",
  VALID_WITH_CAVEATS: "com ressalvas",
  INVALID:            "inválido — revisar",
  PROCESSING:         "processando…",
  PENDING:            "aguardando análise",
}

export function DocumentChecklist({ requiresART, uploadedByType, pendingCorrections }: Props) {
  const items: ChecklistItem[] = [
    { type: "PHOTOS",    required: true },
    { type: "MEMORIAL",  required: true },
    { type: "SCHEDULE",  required: false },
    ...(requiresART ? [{ type: "ART_RRT" as DocumentType, required: true }] : []),
    { type: "PROJECT",   required: false },
  ]

  const missingRequired = items.filter(
    (item) => item.required && !uploadedByType[item.type],
  ).length

  const hasInvalid = items.some(
    (item) => uploadedByType[item.type] === "INVALID",
  )

  return (
    <div className="rounded-md bg-surface shadow-hair">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-divider px-5 py-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-bone-200">
          <Icon name="list" size={14} className="text-ink-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">Documentos necessários</p>
          <p className="font-mono text-[10px] uppercase tracking-caps text-ink-400">
            checklist automático
          </p>
        </div>
      </div>

      {/* Alert banner for pending corrections */}
      {pendingCorrections && hasInvalid && (
        <div className="flex items-start gap-2 border-b border-divider bg-iron-50 px-5 py-3">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0 text-iron-600" />
          <p className="text-xs leading-relaxed text-iron-700">
            Existem documentos inválidos que precisam ser reenviados para prosseguir.
          </p>
        </div>
      )}

      {/* Checklist */}
      <ul className="divide-y divide-divider">
        {items.map((item) => {
          const docStatus = uploadedByType[item.type]
          const iconKey = resolveIconKey(docStatus, item.required)
          // resolveIconKey always returns a key that exists in CHECKLIST_ICON
          const cfg = CHECKLIST_ICON[iconKey]!
          const isInvalidCorrection = pendingCorrections && docStatus === "INVALID"

          return (
            <li
              key={item.type}
              className={cn(
                "flex items-center gap-3 px-5 py-3",
                isInvalidCorrection && "bg-iron-50",
              )}
            >
              {/* Status icon — spinner discreto durante o processamento */}
              {docStatus === "PROCESSING" || docStatus === "PENDING" ? (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-azulejo-100 border-t-azulejo-600" />
                </span>
              ) : (
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    cfg.bg,
                  )}
                  aria-hidden="true"
                >
                  <Icon name={cfg.icon} size={12} className={cfg.color} />
                </span>
              )}

              {/* Label + status */}
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    docStatus === "VALID" ? "text-green-900" : "text-ink-900",
                    !docStatus && !item.required && "text-ink-500",
                  )}
                >
                  {DOCUMENT_TYPE_LABELS[item.type]}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-caps",
                    docStatus === "INVALID" ? "text-iron-600" : "text-ink-400",
                  )}
                >
                  {docStatus
                    ? STATUS_LABELS[docStatus] ?? docStatus.toLowerCase()
                    : item.required
                      ? "obrigatório — não enviado"
                      : "recomendado"}
                </span>
              </div>

              {/* Required badge */}
              {item.required && !docStatus && (
                <span className="shrink-0 rounded-sm bg-iron-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-caps text-iron-600">
                  obrigatório
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Summary footer */}
      {missingRequired > 0 && (
        <div className="border-t border-divider px-5 py-3">
          <p className="text-xs text-ink-500">
            <strong className="text-iron-600">{missingRequired}</strong>{" "}
            documento{missingRequired !== 1 ? "s" : ""} obrigatório
            {missingRequired !== 1 ? "s" : ""} pendente
            {missingRequired !== 1 ? "s" : ""}.
          </p>
        </div>
      )}
      {missingRequired === 0 && (
        <div className="border-t border-divider px-5 py-3">
          <p className="text-xs text-green-700 font-medium">
            Todos os documentos obrigatórios foram enviados.
          </p>
        </div>
      )}
    </div>
  )
}
