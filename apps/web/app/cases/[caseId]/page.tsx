"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  TopBar,
  Card,
  RiskBadge,
  StatusChip,
  Timeline,
  AIMessage,
  UserMessage,
  Button,
  Icon,
  Eyebrow,
  StarRating,
  SpecialistBadge,
  useSpeechRecognition,
} from "@/interfaces/components/ui"
import { appendTranscript } from "@/shared/text"
import type { RiskLevel, IconName } from "@/interfaces/components/ui"
import { CommercialOfferCard } from "./components/CommercialOfferCard"
import { InspectionsPanel } from "./components/InspectionsPanel"
import { CaseHistoryTimeline } from "./components/CaseHistoryTimeline"
import { ReportsSection } from "./components/ReportsSection"
import { NextStepCard } from "./components/NextStepCard"
import { ScopeSummaryCard } from "./components/ScopeSummaryCard"

interface MessageMetadata {
  specialistId?: string
  reportId?: string
  sources?: Array<{ norm: string; section?: string }>
  processSteps?: Array<{ nome: string; duracaoDias: number }>
}

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
  metadata?: MessageMetadata | null
}
interface CaseData {
  id: string; protocol: string; status: string; riskLevel: string | null;
  triageScore: number | null; requiresART: boolean | null; evaluationResult: any;
  reformScope?: any;
  partner?: { user?: { name?: string } } | null
}

// ─── Polling: somente em estados transitórios ────────────────────────────────
const POLLING_STATUSES = [
  "DRAFT",
  "AWAITING_SCOPE_DETAILS",
  "SCOPE_CLASSIFIED",
  "AWAITING_SYNDIC_APPROVAL",
  "AWAITING_DOCUMENTS",
  "DOCUMENTS_UNDER_REVIEW",
  "HUMAN_REVIEW_REQUIRED",
]

// ─── Banners contextuais por status ─────────────────────────────────────────
const STATUS_MESSAGES: Partial<
  Record<string, { icon: IconName; text: string; tone: "info" | "warning" | "success" | "error" }>
> = {
  DRAFT:                    { icon: "clock",    text: "Iniciando triagem…",                                          tone: "info"    },
  AWAITING_SCOPE_DETAILS:   { icon: "chat",     text: "Descreva a reforma no chat ao lado.",                         tone: "info"    },
  SCOPE_CLASSIFIED:         { icon: "check",    text: "Escopo classificado. Envie os documentos para continuar.",    tone: "success" },
  AWAITING_SYNDIC_APPROVAL: { icon: "clock",    text: "Aguardando aprovação do síndico.",                           tone: "warning" },
  AWAITING_DOCUMENTS:       { icon: "upload",   text: "Envie os documentos necessários.",                            tone: "info"    },
  DOCUMENTS_UNDER_REVIEW:   { icon: "search",   text: "Documentos em análise pela IA.",                             tone: "info"    },
  PENDING_CORRECTIONS:      { icon: "alert",    text: "Alguns documentos precisam de correção.",                     tone: "warning" },
  ELIGIBLE_FOR_RELEASE:     { icon: "check",    text: "Sua reforma está apta para liberação!",                      tone: "success" },
  RELEASED_WITH_CONDITIONS: { icon: "info",     text: "Reforma liberada. Veja as condições abaixo.",                tone: "warning" },
  HUMAN_REVIEW_REQUIRED:    { icon: "clock",    text: "Em análise pela nossa equipe técnica. Você será notificado.", tone: "info"   },
  ASSIGNED_TO_PARTNER:      { icon: "user",     text: "Parceiro técnico atribuído à sua obra.",                     tone: "success" },
  CONCLUDED:                { icon: "star",     text: "Obra concluída! Avalie sua experiência.",                    tone: "success" },
  ARCHIVED:                 { icon: "layers",   text: "Este caso foi arquivado.",                                   tone: "error"   },
}

const TONE_CLASSES: Record<"info" | "warning" | "success" | "error", { wrap: string; icon: string }> = {
  info:    { wrap: "bg-bone-100 text-ink-700",           icon: "text-ink-500"    },
  warning: { wrap: "bg-ochre-50 text-ochre-800",         icon: "text-ochre-600"  },
  success: { wrap: "bg-green-50 text-green-800",         icon: "text-green-600"  },
  error:   { wrap: "bg-red-50 text-red-700",             icon: "text-red-500"    },
}

// ─── Timeline: mapa status → índice ─────────────────────────────────────────
function statusToTimelineIndex(status: string): number {
  if (["DRAFT", "AWAITING_SCOPE_DETAILS"].includes(status))                                         return 0
  if (["SCOPE_CLASSIFIED", "AWAITING_SYNDIC_APPROVAL"].includes(status))                            return 1
  if (["AWAITING_DOCUMENTS", "DOCUMENTS_UNDER_REVIEW", "PENDING_CORRECTIONS"].includes(status))     return 2
  if (["ELIGIBLE_FOR_RELEASE", "RELEASED_WITH_CONDITIONS", "HUMAN_REVIEW_REQUIRED"].includes(status)) return 3
  if (["ASSIGNED_TO_PARTNER", "ART_RRT_PENDING", "INSPECTIONS_SCHEDULED", "IN_EXECUTION"].includes(status)) return 4
  if (status === "CONCLUDED")                                                                        return 5
  return -1
}

type Family = "draft" | "progress" | "review" | "attention" | "blocked" | "ok" | "done" | "archived"

const TIMELINE_STEPS: Array<{ title: string; family: Family }> = [
  { title: "Triagem técnica",   family: "progress" },
  { title: "Classificação",     family: "progress" },
  { title: "Documentação",      family: "progress" },
  { title: "Análise",           family: "review"   },
  { title: "Execução",          family: "progress" },
  { title: "Concluído",         family: "done"     },
]

// ─── Static specialist metadata (display only — routing is 100% automatic) ──
const SPECIALIST_META: Record<string, { name: string; color: string }> = {
  triage:   { name: "Triagem",         color: "green"   },
  document: { name: "Documentos",      color: "azulejo" },
  report:   { name: "Relatórios",      color: "ochre"   },
  materials:{ name: "Materiais",       color: "iron"    },
  process:  { name: "Processo",        color: "violet"  },
  review:   { name: "Parecer técnico", color: "iron"    },
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const { status, data: session } = useSession()
  const router = useRouter()
  const [data, setData] = useState<CaseData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  // Ditado por voz — texto que já estava no input ao iniciar a sessão
  const dictationBaseRef = useRef("")
  const {
    supported: voiceSupported,
    listening,
    start: startDictation,
    stop: stopDictation,
  } = useSpeechRecognition({
    onResult: (transcript) =>
      setInput(appendTranscript(dictationBaseRef.current, transcript)),
  })

  function toggleDictation() {
    if (listening) {
      stopDictation()
      return
    }
    dictationBaseRef.current = input
    startDictation()
  }

  // Mobile tab
  const [activeTab, setActiveTab] = useState<"chat" | "details">("chat")

  // Banner "Triagem concluída"
  const prevStatusRef = useRef<string | null>(null)
  const [showTriageBanner, setShowTriageBanner] = useState(false)
  const triageBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Triggered rules "Ver mais"
  const [showAllRules, setShowAllRules] = useState(false)

  // Revelação agregada do rail: os 4 cards assíncronos (proposta, vistorias,
  // relatórios, histórico) só aparecem juntos, quando todos resolveram — em
  // vez de "pipocar" um por vez empurrando o layout.
  const [railLoaded, setRailLoaded] = useState<Set<string>>(() => new Set())
  const markRailLoaded = useCallback((key: string) => {
    setRailLoaded((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])
  const railReady = railLoaded.size >= 4

  // Review state
  const [reviewScore, setReviewScore] = useState(0)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewDismissed, setReviewDismissed] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)
  const [existingReview, setExistingReview] = useState<{ score: number; comment?: string | null } | null | undefined>(undefined)

  useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

  // Snapshot da última resposta — evita setState (e re-render/flicker) quando
  // o polling devolve exatamente os mesmos dados.
  const lastSnapshotRef = useRef<{ case: string; messages: string }>({ case: "", messages: "" })

  async function reload() {
    const [c, m] = await Promise.all([
      fetch(`/api/v1/cases/${caseId}`).then((r) => r.json()),
      fetch(`/api/v1/cases/${caseId}/messages`).then((r) => r.json()),
    ])
    const caseSnap = JSON.stringify(c)
    const msgSnap = JSON.stringify(m.messages ?? [])
    if (caseSnap !== lastSnapshotRef.current.case) {
      lastSnapshotRef.current.case = caseSnap
      setData(c)
    }
    if (msgSnap !== lastSnapshotRef.current.messages) {
      lastSnapshotRef.current.messages = msgSnap
      setMessages(m.messages ?? [])
    }
  }

  // Polling em estados transitórios (10s)
  useEffect(() => {
    if (!data) return
    if (!POLLING_STATUSES.includes(data.status)) return
    const id = setInterval(reload, 10_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status])

  // Banner de triagem concluída ao detectar transição → SCOPE_CLASSIFIED
  useEffect(() => {
    if (!data) return
    const prev = prevStatusRef.current
    if (
      prev !== null &&
      prev !== "SCOPE_CLASSIFIED" &&
      data.status === "SCOPE_CLASSIFIED"
    ) {
      setShowTriageBanner(true)
      if (triageBannerTimerRef.current) clearTimeout(triageBannerTimerRef.current)
      triageBannerTimerRef.current = setTimeout(() => setShowTriageBanner(false), 8_000)
    }
    prevStatusRef.current = data.status
    return () => {
      if (triageBannerTimerRef.current) clearTimeout(triageBannerTimerRef.current)
    }
  }, [data?.status])

  // Fetch existing review when case is CONCLUDED and user is CLIENT
  useEffect(() => {
    if (
      data?.status === "CONCLUDED" &&
      session?.user?.role === "CLIENT" &&
      existingReview === undefined
    ) {
      fetch(`/api/v1/cases/${caseId}/review`)
        .then((r) => r.json())
        .then((body) => setExistingReview(body.review))
        .catch(() => setExistingReview(null))
    }
  }, [data?.status, session?.user?.role, caseId, existingReview])

  async function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (reviewScore === 0 || reviewSubmitting) return
    setReviewSubmitting(true)
    try {
      const res = await fetch(`/api/v1/cases/${caseId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: reviewScore, comment: reviewComment || undefined }),
      })
      if (res.ok) {
        setReviewDone(true)
      }
    } finally {
      setReviewSubmitting(false)
    }
  }

  useEffect(() => { if (status === "authenticated") reload() }, [status, caseId])

  // Auto-scroll do chat: apenas quando chega mensagem NOVA ou durante o
  // streaming — nunca em refetch de polling (senão a página "desce sozinha").
  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    const grew = messages.length > prevMsgCountRef.current
    prevMsgCountRef.current = messages.length
    if (grew || streamingContent) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages, streamingContent])

  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    stopDictation()
    const content = input.trim()
    setInput("")
    setSending(true)
    setStreamingContent("")

    const tempId = `tmp-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "USER", content, createdAt: new Date().toISOString() },
    ])

    const es = new EventSource(
      `/api/v1/cases/${caseId}/messages/stream?content=${encodeURIComponent(content)}`,
    )

    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string)
      switch (data.type as string) {
        case "user_message":
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempId),
            data.message as Message,
          ])
          break
        case "chunk":
          setStreamingContent((prev) => prev + (data.content as string))
          break
        case "done":
          es.close()
          setSending(false)
          setStreamingContent("")
          reload()
          break
        case "error":
          es.close()
          setSending(false)
          setStreamingContent("")
          break
      }
    }

    es.onerror = () => {
      es.close()
      setSending(false)
      setStreamingContent("")
    }
  }

  if (status !== "authenticated" || !data) return null

  const triggered = data.evaluationResult?.triggeredRules ?? []
  const visibleRules = showAllRules ? triggered : triggered.slice(0, 5)
  const hasMoreRules = triggered.length > 5

  const activeIndex = statusToTimelineIndex(data.status)

  const statusMsg = STATUS_MESSAGES[data.status]

  const showReviewPrompt =
    session?.user?.role === "CLIENT" &&
    data.status === "CONCLUDED" &&
    existingReview !== undefined &&
    existingReview === null &&
    !reviewDismissed &&
    !reviewDone

  const partnerName = data.partner?.user?.name ?? "o parceiro"

  // ── Right rail content ───────────────────────────────────────────────────
  const rightRail = (
    <aside className="overflow-y-auto border-t border-divider bg-paper p-4 md:p-6 lg:border-l lg:border-t-0">
      {/* Próximo passo — CTA primário (só quando acionável) */}
      <div className="mb-4 empty:hidden">
        <NextStepCard caseId={caseId} status={data.status} />
      </div>

      <Eyebrow>Caso em andamento</Eyebrow>
      <p className="mt-1.5 font-mono text-sm text-ink-500">{data.protocol}</p>

      {/* Status & Risk */}
      <div className="mt-5 flex items-center justify-between">
        <div>
          <Eyebrow className="mb-1.5">Status</Eyebrow>
          <StatusChip status={data.status} />
        </div>
        {data.riskLevel && (
          <div className="text-right">
            <Eyebrow className="mb-1.5">Risco</Eyebrow>
            <RiskBadge
              level={data.riskLevel as RiskLevel}
              score={data.triageScore ?? undefined}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Banner contextual de status */}
      {statusMsg && (
        <div
          className={`mt-3 flex items-start gap-2.5 rounded-md px-3 py-2.5 ${TONE_CLASSES[statusMsg.tone].wrap}`}
          role="status"
          aria-live="polite"
        >
          <Icon
            name={statusMsg.icon}
            size={14}
            className={`mt-0.5 shrink-0 ${TONE_CLASSES[statusMsg.tone].icon}`}
          />
          <p className="text-xs leading-relaxed">{statusMsg.text}</p>
        </div>
      )}

      {/* Skeleton único enquanto os cards assíncronos do rail carregam —
          reserva espaço e evita 4 saltos de layout em sequência */}
      {!railReady && (
        <div className="mt-4 space-y-3" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-md bg-bone-100" />
          <div className="h-14 animate-pulse rounded-md bg-bone-100" />
        </div>
      )}

      <div className={railReady ? "contents" : "hidden"}>
        {/* Proposta comercial — aparece quando há oferta para o caso */}
        <div id="proposta-comercial" className="mt-4 empty:hidden">
          <CommercialOfferCard
            caseId={caseId}
            isClient={session?.user?.role === "CLIENT"}
            onAccepted={reload}
            onLoaded={() => markRailLoaded("offer")}
          />
        </div>

        {/* Vistorias — aparece quando há vistorias no caso */}
        <div className="mt-4 empty:hidden">
          <InspectionsPanel caseId={caseId} onLoaded={() => markRailLoaded("inspections")} />
        </div>

        {/* Relatórios & documentos gerados — com geração da análise completa
            em PDF assim que o caso está classificado */}
        <div className="mt-4 empty:hidden">
          <ReportsSection
            caseId={caseId}
            refreshKey={data.status}
            allowGenerate={data.riskLevel != null}
            onLoaded={() => markRailLoaded("reports")}
          />
        </div>
      </div>

      {/* ART */}
      {data.requiresART !== null && (
        <div className="mt-4 flex items-center gap-2">
          <Icon name="doc" size={14} className="text-ink-400" />
          <span className="text-xs text-ink-600">
            ART/RRT:{" "}
            <strong>{data.requiresART ? "Exigida" : "Não exigida"}</strong>
          </span>
        </div>
      )}

      {/* Resumo do escopo da reforma */}
      <div className="mt-4 empty:hidden">
        <ScopeSummaryCard scope={data.reformScope} />
      </div>

      {/* Por que essa classificação? (regras disparadas) */}
      <div className="mt-5" data-testid="evaluation-result">
        <Eyebrow className="mb-2">Por que essa classificação?</Eyebrow>
        {triggered.length === 0 ? (
          <p className="text-xs text-ink-400">Aguardando classificação…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRules.map((r: any) => (
              <div
                key={r.ruleId}
                className="rounded-sm bg-bone-100 px-3 py-2"
              >
                <p className="text-xs leading-relaxed text-ink-600">{r.reason}</p>
              </div>
            ))}
            {hasMoreRules && (
              <button
                type="button"
                onClick={() => setShowAllRules((v) => !v)}
                className="mt-1 cursor-pointer text-left text-xs font-medium text-green-700 underline-offset-2 hover:underline"
              >
                {showAllRules
                  ? "Ver menos"
                  : `Ver mais ${triggered.length - 5} regra${triggered.length - 5 > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Timeline com etapa atual destacada */}
      <div className="mt-5">
        <Eyebrow className="mb-3">Etapas do processo</Eyebrow>
        <Timeline
          dense
          items={TIMELINE_STEPS.map((step, i) => ({
            title: step.title,
            family: i < activeIndex ? "done" : step.family,
            current: i === activeIndex,
          }))}
        />
      </div>

      {/* Histórico real de transições (CaseTransitionLog) — revela junto com o rail */}
      <div className={railReady ? "block" : "hidden"}>
        <CaseHistoryTimeline
          caseId={caseId}
          refreshKey={data.status}
          onLoaded={() => markRailLoaded("history")}
        />
      </div>

      {/* ART/RRT disclaimer — apenas uma vez, no final, discreto */}
      <div className="mt-5 flex items-start gap-2 rounded-md bg-bone-100 px-3 py-2.5">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-ink-400" />
        <p className="text-[11px] leading-relaxed text-ink-400">
          <strong className="text-ink-500">A plataforma não emite ART/RRT.</strong>{" "}
          A emissão formal é responsabilidade do profissional habilitado parceiro.
        </p>
      </div>
    </aside>
  )

  // ── Chat column content ──────────────────────────────────────────────────
  const chatColumn = (
    <div className="flex flex-col lg:overflow-hidden" style={{ background: "var(--rai-bone-100)" }}>
      {/* Banner "Triagem concluída" */}
      {showTriageBanner && (
        <div
          className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-md bg-green-50 px-4 py-3 shadow-hair md:mx-10"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-2.5">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                Triagem concluída! Seu caso foi classificado.
              </p>
              <p className="mt-0.5 text-xs text-green-700">
                Acesse a aba Documentos para continuar.{" "}
                <Link
                  href={`/cases/${caseId}/documents`}
                  className="font-semibold underline underline-offset-2 hover:no-underline"
                >
                  Ir agora →
                </Link>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTriageBanner(false)}
            className="cursor-pointer text-green-600 hover:text-green-800"
            aria-label="Fechar aviso"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 md:px-10 md:py-7">
        {messages.length === 0 && (
          <AIMessage>
            Olá! Sou o assistente da ReformAI. Descreva sua reforma em linguagem
            natural e vou conduzir a triagem técnica.
          </AIMessage>
        )}
        {messages.map((m) => {
          const isUser = m.role === "USER"
          const cleanContent = m.content.trim()
          if (isUser) {
            return (
              <div key={m.id} data-testid="chat-message-user">
                <UserMessage>
                  {cleanContent || "(coletando dados…)"}
                </UserMessage>
              </div>
            )
          }

          const meta = m.metadata
          const msgSpecialistId = meta?.specialistId
          const specialistMeta = msgSpecialistId ? SPECIALIST_META[msgSpecialistId] : undefined

          // Render simple Markdown for report messages
          const isReport = msgSpecialistId === "report" && !!meta?.reportId

          return (
            <div key={m.id} data-testid="chat-message-assistant">
              {/* Specialist badge — informative only, not interactive; hidden for triage */}
              {msgSpecialistId && msgSpecialistId !== "triage" && specialistMeta && (
                <SpecialistBadge
                  specialistId={msgSpecialistId}
                  specialistName={specialistMeta.name}
                  color={specialistMeta.color}
                />
              )}
              <AIMessage
                disclaimer={
                  msgSpecialistId === "review"
                    ? "Parecer emitido por revisor técnico habilitado — não é conteúdo gerado por IA."
                    : "Esta análise é assistiva. O Rule Engine valida deterministicamente e casos HIGH/CRITICAL passam por revisão humana."
                }
              >
                {cleanContent || "(coletando dados…)"}
              </AIMessage>

              {/* Report: "Ver documento gerado" button */}
              {isReport && meta?.reportId && (
                <div className="mt-2 ml-11">
                  <a
                    href={`/api/v1/cases/${caseId}/reports/${meta.reportId}/url`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-ochre-100 px-3 py-1.5 text-xs font-medium text-ochre-800 transition-colors duration-150 hover:bg-ochre-200"
                  >
                    <Icon name="list" size={12} />
                    Ver documento gerado
                  </a>
                </div>
              )}

              {/* ProcessSpecialist: process steps table */}
              {meta?.processSteps && meta.processSteps.length > 0 && (
                <div className="ml-11 mt-3 overflow-hidden rounded-sm border border-bone-300 text-xs">
                  <table className="w-full">
                    <thead className="bg-bone-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-ink-600">#</th>
                        <th className="px-3 py-2 text-left text-ink-600">Etapa</th>
                        <th className="px-3 py-2 text-left text-ink-600">Dias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meta.processSteps.map((step, i) => (
                        <tr key={i} className="border-t border-bone-200">
                          <td className="px-3 py-2 text-ink-500">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-ink-900">{step.nome}</td>
                          <td className="px-3 py-2 text-ink-500">{step.duracaoDias}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* MaterialsSpecialist: sources list */}
              {meta?.sources && meta.sources.length > 0 && (
                <div className="ml-11 mt-2 space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    Fontes
                  </p>
                  {meta.sources.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-sm bg-bone-50 px-2 py-1 text-[11px] text-ink-600"
                    >
                      <span className="font-medium">{s.norm}</span>
                      {s.section && (
                        <span className="text-ink-400"> §{s.section}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {sending && streamingContent && (
          <div data-testid="chat-message-assistant">
            <AIMessage>{streamingContent}</AIMessage>
          </div>
        )}
        {sending && !streamingContent && (
          <div className="flex items-end gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-green-900">
              <Icon name="sparkle" size={14} className="text-green-300" />
            </div>
            <div className="flex gap-1 rounded-[2px_12px_12px_12px] bg-surface px-4 py-3 shadow-hair">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-ink-300"
                  style={{ opacity: 0.4 + 0.2 * i }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div
        className="border-t border-divider px-4 pb-4 pt-3 md:px-10 md:pb-6 md:pt-4"
        style={{ background: "var(--rai-bone-100)" }}
      >
        <form
          onSubmit={send}
          className="flex flex-col gap-2.5 rounded-md bg-surface p-3.5 shadow-1"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? "Ouvindo… fale agora" : "Descreva a reforma…"}
            className="min-h-[22px] border-none bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-300 md:text-sm"
            disabled={sending}
            data-testid="chat-input"
          />
          <div className="flex items-center justify-between">
            {/* Botão de anexar → link para documentos */}
            <Link
              href={`/cases/${caseId}/documents`}
              className="flex h-8 items-center gap-1.5 rounded px-2 text-xs text-ink-500 hover:bg-bone-100 hover:text-ink-700 transition-colors"
              title="Enviar documentos"
              tabIndex={-1}
            >
              <Icon name="paperclip" size={14} />
              <span className="hidden sm:inline">Documentos</span>
            </Link>
            <div className="flex items-center gap-1.5">
              {/* Ditado por voz — oculto em browsers sem Web Speech API */}
              {voiceSupported && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={sending}
                  aria-label={listening ? "Parar ditado por voz" : "Ditar mensagem por voz"}
                  aria-pressed={listening}
                  title={listening ? "Parar ditado" : "Falar em vez de digitar"}
                  data-testid="chat-mic"
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    listening
                      ? "animate-pulse bg-red-50 text-red-600 hover:bg-red-100"
                      : "text-ink-500 hover:bg-bone-100 hover:text-ink-700"
                  }`}
                >
                  <Icon name="mic" size={15} />
                </button>
              )}
              <Button
                type="submit"
                variant="primary"
                size="sm"
                iconRight="send"
                disabled={sending || !input.trim()}
                data-testid="chat-send"
              >
                {sending ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  return (
    <>
      {/* Review modal overlay */}
      {showReviewPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4 backdrop-blur-sm"
          aria-modal="true"
          role="dialog"
          aria-labelledby="review-dialog-title"
        >
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-xl bg-surface p-6 shadow-2xl">
            {reviewDone ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <Icon name="check" size={20} className="text-green-700" />
                </div>
                <h2 className="text-base font-semibold text-ink-900">Obrigado pela avaliação!</h2>
                <p className="text-sm text-ink-500">Sua opinião ajuda outros moradores a escolher o melhor profissional.</p>
                <Button variant="primary" size="sm" onClick={() => setReviewDismissed(true)}>
                  Fechar
                </Button>
              </div>
            ) : (
              <form onSubmit={submitReview} className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ochre-100">
                    <Icon name="star" size={18} className="text-ochre-600" />
                  </div>
                  <div>
                    <h2
                      id="review-dialog-title"
                      className="text-sm font-semibold text-ink-900"
                    >
                      Sua obra foi concluída!
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-500">
                      Como foi sua experiência com {partnerName}?
                    </p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <StarRating value={reviewScore} onChange={setReviewScore} size={36} />
                </div>

                {reviewScore > 0 && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="review-comment"
                      className="text-xs font-medium text-ink-700"
                    >
                      Comentário (opcional)
                    </label>
                    <textarea
                      id="review-comment"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Conte como foi a experiência…"
                      className="rounded-md border border-divider bg-bone-50 px-3 py-2 text-sm text-ink-900 outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 placeholder:text-ink-300 resize-none"
                    />
                    <span className="text-right text-xs text-ink-400">
                      {reviewComment.length}/500
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setReviewDismissed(true)}
                  >
                    Depois
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={reviewScore === 0 || reviewSubmitting}
                  >
                    {reviewSubmitting ? "Enviando…" : "Avaliar"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <TopBar
        breadcrumb={["Minhas reformas", data.protocol]}
        title={data.protocol}
        subtitle="Triagem do caso — IA conduz, você decide."
        actions={
          <>
            <StatusChip status={data.status} />
            <Link href={`/cases/${caseId}/documents`}>
              <Button variant="secondary" icon="doc" size="sm">
                Documentos
              </Button>
            </Link>
          </>
        }
      />

      {/* hidden testid anchors for E2E */}
      <span className="sr-only" data-testid="case-protocol">{data.protocol}</span>
      <span className="sr-only" data-testid="case-status">{data.status}</span>
      {data.riskLevel && (
        <span className="sr-only" data-testid="case-risk-level">{data.riskLevel}</span>
      )}

      {/* Mobile tabs (oculto em lg) */}
      <div className="flex border-b border-divider lg:hidden" role="tablist" aria-label="Seções do caso">
        <button
          role="tab"
          aria-selected={activeTab === "chat"}
          aria-controls="panel-chat"
          onClick={() => setActiveTab("chat")}
          className={`flex-1 cursor-pointer py-2.5 text-sm font-medium transition-colors ${
            activeTab === "chat"
              ? "border-b-2 border-green-600 text-green-700"
              : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Chat
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "details"}
          aria-controls="panel-details"
          onClick={() => setActiveTab("details")}
          className={`flex-1 cursor-pointer py-2.5 text-sm font-medium transition-colors ${
            activeTab === "details"
              ? "border-b-2 border-green-600 text-green-700"
              : "text-ink-500 hover:text-ink-700"
          }`}
        >
          Detalhes
        </button>
      </div>

      {/* Grid principal */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_320px] lg:overflow-hidden">
        {/* Chat column — oculto em mobile quando aba "details" está ativa */}
        <div
          id="panel-chat"
          role="tabpanel"
          className={activeTab === "details" ? "hidden lg:flex lg:flex-col lg:overflow-hidden" : "flex flex-col lg:overflow-hidden"}
          style={{ background: "var(--rai-bone-100)" }}
        >
          {chatColumn}
        </div>

        {/* Right rail — oculto em mobile quando aba "chat" está ativa */}
        <div
          id="panel-details"
          role="tabpanel"
          className={activeTab === "chat" ? "hidden lg:block" : "block"}
        >
          {rightRail}
        </div>
      </div>
    </>
  )
}
