"use client"
import { useEffect, useState } from "react"
import { Icon } from "@/interfaces/components/ui"

interface InspectionRow {
  id: string
  type: string
  status: string
  scheduledAt: string | null
  completedAt: string | null
  notes: string | null
}

interface PhotoItem {
  index: number
  url: string
}

const TYPE_LABEL: Record<string, string> = {
  INITIAL: "Vistoria inicial",
  INTERMEDIATE: "Vistoria intermediária",
  FINAL: "Vistoria final",
  EXTRA: "Vistoria extra",
  CRITICAL_SYSTEM: "Vistoria de sistema crítico",
}

const STATUS_META: Record<string, { label: string; chip: string; icon: "check" | "clock" | "close" }> = {
  SCHEDULED: { label: "Agendada", chip: "bg-azulejo-100 text-azulejo-800", icon: "clock" },
  COMPLETED: { label: "Concluída", chip: "bg-green-100 text-green-800", icon: "check" },
  CANCELLED: { label: "Cancelada", chip: "bg-iron-100 text-iron-700", icon: "close" },
  RESCHEDULED: { label: "Reagendada", chip: "bg-ochre-100 text-ochre-800", icon: "clock" },
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

/** Galeria de fotos de uma vistoria — carregada sob demanda. */
function InspectionPhotos({ caseId, inspectionId }: { caseId: string; inspectionId: string }) {
  const [photos, setPhotos] = useState<PhotoItem[] | null>(null)
  const [open, setOpen] = useState(false)

  async function toggle() {
    if (!open && photos === null) {
      try {
        const res = await fetch(`/api/v1/cases/${caseId}/inspections/${inspectionId}/photos`)
        const body = res.ok ? await res.json() : { photos: [] }
        setPhotos(Array.isArray(body.photos) ? body.photos : [])
      } catch {
        setPhotos([])
      }
    }
    setOpen((v) => !v)
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-green-700 hover:underline"
      >
        <Icon name={open ? "minus" : "eye"} size={11} />
        {open ? "Ocultar fotos" : "Ver fotos"}
      </button>
      {open && photos && (
        photos.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-ink-400">Sem fotos nesta vistoria.</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {photos.map((p) => (
              <a
                key={p.index}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-sm border border-bone-300"
                title="Abrir foto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Foto da vistoria ${p.index + 1}`}
                  className="aspect-square h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )
      )}
    </div>
  )
}

/**
 * Painel de vistorias do caso (read-only para o morador): tipo, data, status,
 * notas e fotos. Não aparece se não houver vistoria.
 */
export function InspectionsPanel({
  caseId,
  onLoaded,
}: {
  caseId: string
  /** Sinaliza ao pai que o primeiro fetch terminou (para revelar o rail de uma vez). */
  onLoaded?: () => void
}) {
  const [inspections, setInspections] = useState<InspectionRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/v1/cases/${caseId}/inspections`)
      .then((r) => (r.ok ? r.json() : { inspections: [] }))
      .then((body) => {
        if (active) setInspections(Array.isArray(body.inspections) ? body.inspections : [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true)
        onLoaded?.()
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  if (!loaded || inspections.length === 0) return null

  return (
    <div className="rounded-md bg-surface p-5 shadow-hair" data-testid="inspections-panel">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-azulejo-100">
          <Icon name="search" size={16} className="text-azulejo-700" />
        </div>
        <p className="text-sm font-semibold text-ink-900">Vistorias</p>
      </div>

      <ul className="flex flex-col divide-y divide-divider">
        {inspections.map((insp) => {
          const meta =
            STATUS_META[insp.status] ??
            ({ label: insp.status, chip: "bg-bone-100 text-ink-700", icon: "clock" } as const)
          const when = formatDate(insp.completedAt) ?? formatDate(insp.scheduledAt)
          return (
            <li key={insp.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-900">
                  {TYPE_LABEL[insp.type] ?? insp.type}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}
                >
                  <Icon name={meta.icon} size={11} />
                  {meta.label}
                </span>
              </div>
              {when && (
                <p className="mt-1 font-mono text-[11px] text-ink-400">{when}</p>
              )}
              {insp.notes && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{insp.notes}</p>
              )}
              {insp.status === "COMPLETED" && (
                <InspectionPhotos caseId={caseId} inspectionId={insp.id} />
              )}
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
        O pacote inclui no mínimo 3 vistorias; extras são cobradas à parte.
      </p>
    </div>
  )
}
