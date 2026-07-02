"use client"
import { useCallback, useEffect, useState } from "react"
import { Icon, Eyebrow, type IconName } from "@/interfaces/components/ui"

interface ReportRow {
  id: string
  type: string
  version: number
  generatedAt: string
}

const TYPE_META: Record<string, { label: string; icon: IconName }> = {
  ANALYSIS: { label: "Relatório de análise", icon: "search" },
  TECHNICAL_OPINION: { label: "Parecer técnico", icon: "doc" },
  COMMERCIAL_PROPOSAL: { label: "Proposta comercial", icon: "star" },
  SERVICE_ORDER: { label: "Ordem de serviço", icon: "list" },
  INSPECTION_SUMMARY: { label: "Resumo de vistoria", icon: "search" },
  RELEASE_OPINION: { label: "Parecer de liberação", icon: "shield" },
  MEMORIAL_DESCRITIVO: { label: "Memorial descritivo", icon: "doc" },
  CRONOGRAMA: { label: "Cronograma", icon: "clock" },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" })
  } catch {
    return iso
  }
}

/**
 * Central de relatórios do caso — todos os documentos gerados pela plataforma
 * num só lugar, com download em PDF. Quando `allowGenerate` é verdadeiro,
 * exibe também o botão para gerar o relatório de análise completo (conversa
 * de triagem + classificação + análise documental consolidadas em um PDF).
 */
export function ReportsSection({
  caseId,
  refreshKey,
  allowGenerate = false,
  onLoaded,
}: {
  caseId: string
  refreshKey?: string
  allowGenerate?: boolean
  /** Sinaliza ao pai que o primeiro fetch terminou (para revelar o rail de uma vez). */
  onLoaded?: () => void
}) {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedId, setGeneratedId] = useState<string | null>(null)

  const fetchReports = useCallback(() => {
    return fetch(`/api/v1/cases/${caseId}/reports`)
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((body) => {
        setReports(Array.isArray(body.reports) ? body.reports : [])
      })
      .catch(() => {})
  }, [caseId])

  useEffect(() => {
    let active = true
    fetchReports().finally(() => {
      if (active) setLoaded(true)
      onLoaded?.()
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchReports, refreshKey])

  async function generateFullAnalysis() {
    setGenerating(true)
    setError(null)
    setGeneratedId(null)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/reports/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportType: "ANALYSIS", enrichWithAI: true }),
      })
      if (res.status === 429) {
        setError("Muitas gerações em sequência. Aguarde alguns minutos e tente novamente.")
        return
      }
      if (!res.ok) {
        setError("Não foi possível gerar o relatório agora. Tente novamente.")
        return
      }
      const report = (await res.json()) as { id: string }
      await fetchReports()
      // Não usamos window.open aqui: após um await longo o navegador não
      // considera mais o clique como gesto do usuário e bloqueia o popup.
      setGeneratedId(report.id)
    } catch {
      setError("Não foi possível gerar o relatório agora. Tente novamente.")
    } finally {
      setGenerating(false)
    }
  }

  if (!loaded || (reports.length === 0 && !allowGenerate)) return null

  return (
    <div className="rounded-md bg-surface p-5 shadow-hair" data-testid="reports-section">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-bone-200">
          <Icon name="layers" size={16} className="text-ink-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">Relatórios &amp; documentos</p>
          <Eyebrow>Gerados pela plataforma</Eyebrow>
        </div>
      </div>

      {reports.length > 0 && (
        <ul className="flex flex-col divide-y divide-divider">
          {reports.map((r) => {
            const meta = TYPE_META[r.type] ?? { label: r.type, icon: "doc" as IconName }
            return (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Icon name={meta.icon} size={15} className="shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-900">
                    {meta.label}
                    {r.version > 1 && (
                      <span className="ml-1 font-mono text-[10px] text-ink-400">v{r.version}</span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] text-ink-400">{formatDate(r.generatedAt)}</p>
                </div>
                <a
                  href={`/api/v1/cases/${caseId}/reports/${r.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm bg-bone-100 px-2.5 py-1 text-[11px] font-medium text-ink-700 transition-colors hover:bg-bone-200"
                  title="Baixar PDF"
                >
                  <Icon name="doc" size={11} />
                  PDF
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {allowGenerate && (
        <div className={reports.length > 0 ? "mt-3 border-t border-divider pt-3" : ""}>
          <button
            type="button"
            onClick={generateFullAnalysis}
            disabled={generating}
            data-testid="generate-full-analysis"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-green-800 px-3 py-2 text-xs font-medium text-bone-50 transition-colors hover:bg-green-900 disabled:cursor-wait disabled:opacity-60"
          >
            <Icon name="doc" size={13} />
            {generating ? "Gerando análise completa…" : "Gerar análise completa (PDF)"}
          </button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
            Consolida a conversa da triagem, a classificação de risco e o resultado
            da análise dos documentos em um único PDF.
          </p>
          {generatedId && (
            <div
              className="mt-2 flex items-center justify-between gap-2 rounded-sm bg-green-50 px-2.5 py-2"
              role="status"
            >
              <span className="text-[11px] font-medium text-green-800">
                Relatório pronto!
              </span>
              <a
                href={`/api/v1/cases/${caseId}/reports/${generatedId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm bg-green-800 px-2.5 py-1 text-[11px] font-medium text-bone-50 transition-colors hover:bg-green-900"
              >
                <Icon name="doc" size={11} />
                Abrir PDF
              </a>
            </div>
          )}
          {error && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-start gap-1.5 border-t border-divider pt-2.5">
        <Icon name="shield" size={12} className="mt-0.5 shrink-0 text-ink-400" />
        <p className="text-[10px] leading-relaxed text-ink-400">
          Documentos gerados com apoio de IA. Não substituem a ART/RRT, emitida
          pelo profissional habilitado parceiro.
        </p>
      </div>
    </div>
  )
}
