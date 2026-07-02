"use client"

/**
 * Formulário de conclusão de vistoria do parceiro — pronto para campo (PWA):
 *  - captura geolocalização (GPS) e anexa às fotos
 *  - online: sobe fotos para a rota de fotos da vistoria + marca concluída
 *  - offline (ou falha de rede): enfileira em IndexedDB e sincroniza depois
 */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Icon } from "@/interfaces/components/ui"
import {
  enqueueInspection,
  flushQueue,
  countPending,
  type QueuedPhoto,
} from "@/shared/offline-queue"

const MAX_PHOTOS = 10
const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"]

interface Gps {
  lat: number
  lng: number
  accuracy: number | null
}

interface CompleteInspectionFormProps {
  caseId: string
  inspectionId: string
}

function getGps(): Promise<Gps | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

function gpsField(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) ? String(v) : "nan"
}

export function CompleteInspectionForm({ caseId, inspectionId }: CompleteInspectionFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [notes, setNotes] = useState("")
  const [photos, setPhotos] = useState<File[]>([])
  const [gps, setGps] = useState<Gps | null>(null)
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "ok" | "denied">("idle")
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  const notesValid = notes.trim().length >= 50
  const notesLen = notes.trim().length

  useEffect(() => {
    countPending().then(setPending).catch(() => undefined)
  }, [])

  async function captureGps() {
    setGpsState("locating")
    const g = await getGps()
    setGps(g)
    setGpsState(g ? "ok" : "denied")
  }

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const valid = files.filter((f) => ALLOWED_PHOTO_MIME.includes(f.type))
    if (valid.length !== files.length) setError("Apenas JPEG/PNG/WebP são aceitos.")
    else setError(null)
    setPhotos(valid.slice(0, MAX_PHOTOS))
    if (valid.length > 0 && gpsState === "idle") void captureGps()
  }

  async function uploadOnline() {
    if (photos.length > 0) {
      setProgress(`Enviando ${photos.length} foto(s)…`)
      const form = new FormData()
      for (const p of photos) {
        form.append("file", p)
        form.append("lat", gpsField(gps?.lat))
        form.append("lng", gpsField(gps?.lng))
        form.append("accuracy", gpsField(gps?.accuracy))
      }
      const up = await fetch(`/api/v1/cases/${caseId}/inspections/${inspectionId}/photos`, {
        method: "POST",
        body: form,
      })
      if (!up.ok) throw new Error(`Falha no envio das fotos (${up.status})`)
    }
    setProgress("Registrando conclusão…")
    const done = await fetch(`/api/v1/cases/${caseId}/inspections/${inspectionId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes.trim(), photoStorageKeys: [] }),
    })
    if (!done.ok) {
      const data = await done.json().catch(() => ({}))
      throw new Error((data as { message?: string }).message ?? `Erro ao concluir (${done.status})`)
    }
  }

  async function queueOffline() {
    const queuedPhotos: QueuedPhoto[] = photos.map((p) => ({ blob: p, name: p.name, type: p.type }))
    await enqueueInspection({ caseId, inspectionId, notes: notes.trim(), photos: queuedPhotos, gps })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!notesValid || loading) return
    setLoading(true)
    setError(null)

    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    try {
      if (offline) {
        await queueOffline()
        router.push(`/partner/cases/${caseId}/inspections?queued=1`)
        return
      }
      await uploadOnline()
      router.push(`/partner/cases/${caseId}/inspections`)
    } catch (err) {
      // Falha de rede em runtime → salva offline para sincronizar depois.
      try {
        await queueOffline()
        router.push(`/partner/cases/${caseId}/inspections?queued=1`)
        return
      } catch {
        setError(err instanceof Error ? err.message : "Erro inesperado")
      }
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {pending > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-sm border border-ochre-300 bg-ochre-100 px-4 py-2.5 text-sm text-ochre-700">
          <span>{pending} vistoria(s) aguardando sincronização.</span>
          <button
            type="button"
            className="font-medium underline"
            onClick={async () => {
              const r = await flushQueue()
              setPending(await countPending())
              if (r.flushed > 0) router.refresh()
            }}
          >
            Sincronizar agora
          </button>
        </div>
      )}

      {/* Notas */}
      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium text-ink-700">
          Notas técnicas <span className="font-normal text-ink-400">(mínimo 50 caracteres)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          disabled={loading}
          placeholder="Descreva as observações técnicas da vistoria…"
          className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-green-400 disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-bone-200">
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{
                width: `${Math.min((notesLen / 50) * 100, 100)}%`,
                background: notesValid ? "var(--rai-green-600)" : "var(--rai-ochre-500)",
              }}
            />
          </div>
          <span className={`font-mono text-xs ${notesValid ? "text-green-700" : "text-ink-400"}`}>
            {notesLen} / 50
          </span>
        </div>
      </div>

      {/* Fotos */}
      <div className="space-y-1.5">
        <label htmlFor="photos" className="text-sm font-medium text-ink-700">
          Fotos da vistoria <span className="font-normal text-ink-400">(máx. {MAX_PHOTOS})</span>
        </label>
        <div
          className="cursor-pointer rounded-sm border border-dashed border-bone-400 bg-bone-50 p-5 transition-colors hover:bg-bone-100"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
              <Icon name="upload" size={18} className="text-green-700" />
            </div>
            <div className="text-sm font-medium text-ink-900">
              {photos.length > 0 ? `${photos.length} foto(s) selecionada(s)` : "Tirar ou selecionar fotos"}
            </div>
            <div className="text-xs text-ink-500">A câmera abre direto no celular</div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          id="photos"
          type="file"
          multiple
          accept="image/*"
          capture="environment"
          onChange={handlePhotosChange}
          disabled={loading}
          className="sr-only"
        />

        {/* GPS */}
        <div className="flex items-center gap-2 text-xs">
          <Icon name="info" size={12} className="text-ink-400" />
          {gpsState === "ok" && gps ? (
            <span className="text-green-700">
              Local capturado: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              {gps.accuracy ? ` (±${Math.round(gps.accuracy)}m)` : ""}
            </span>
          ) : gpsState === "locating" ? (
            <span className="text-ink-500">Obtendo localização…</span>
          ) : gpsState === "denied" ? (
            <button type="button" className="text-ochre-700 underline" onClick={captureGps}>
              Localização indisponível — tentar de novo
            </button>
          ) : (
            <button type="button" className="text-green-700 underline" onClick={captureGps}>
              Capturar localização (GPS)
            </button>
          )}
        </div>
      </div>

      {progress && (
        <div className="flex items-center gap-2 rounded-sm border border-azulejo-300 bg-azulejo-100 px-4 py-2.5 text-sm text-azulejo-700">
          <Icon name="clock" size={14} className="shrink-0" />
          {progress}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-sm border border-clay-300 bg-clay-100 px-4 py-2.5 text-sm text-clay-600">
          <Icon name="alert" size={14} className="shrink-0" />
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        icon="check"
        disabled={loading || !notesValid}
        className="w-full sm:w-auto"
      >
        {loading ? "Registrando…" : "Registrar vistoria concluída"}
      </Button>
    </form>
  )
}
