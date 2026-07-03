# APP-STATE.md — Estado Atual da Aplicação
# Plataforma SaaS ART/RRT — "ReformAI"

> Snapshot do estado real do código em **2026-05-25** (branch `main`, commit `c310193`),
> com adendo de **2026-06-01** sobre prontidão para produção (ver §21).
> Documento descritivo do que **está implementado** — não é especificação.
> A especificação/fonte-de-verdade é o `CLAUDE.md`. Onde os dois divergem, este
> arquivo registra a divergência explicitamente (ver §20).

---

## 1. RESUMO EXECUTIVO

A plataforma está em estado **coeso e funcional para MVP**. O fluxo central
— triagem por chat → classificação determinística → documentos → revisão humana
→ proposta comercial → atribuição a parceiro → vistorias → conclusão — está todo
implementado de ponta a ponta, com painéis para os 4 perfis de usuário
(morador, síndico, parceiro, admin) e um painel adicional de superadmin.

**O que funciona:**
- Monorepo Bun + Turborepo, Next.js 14 App Router, Prisma + PostgreSQL 16, BullMQ + Redis, MinIO/S3.
- DDD com **12 bounded contexts**; camadas `domain`/`application`/`infrastructure` respeitadas na maior parte.
- `CaseStateMachine` determinística, `DeterministicEvaluator` puro, 5 agentes de IA com saída validada por Zod.
- Pipeline documental completo: 6 passos idempotentes em BullMQ (OCR → extração → validação → status → checklist → evento).
- **9 migrations aplicadas**; seed essencial + seed demo (13 casos pelo ciclo de vida).
- Design system "Concreto Verde" (18 componentes UI base + 6 smart, white-label via CSS vars).
- **21 arquivos de teste unitário** (Vitest) + 5 specs E2E (Playwright).
- Dockerfiles para web e worker; deploy em produção via Dokploy/Swarm.
- Infraestrutura adicional: email (Resend/SMTP), push notifications (Web Push API), embeddings (HuggingFace), rate-limiting (Redis).
- Fluxo completo de recuperação de senha (pages + backend + modelo).
- Busca de normas (NBR 16280) via RAG com pgvector.
- Impersonation de usuário para SUPER_ADMIN.
- PWA com suporte a offline e push notifications.

**O que falta / está frágil:**
- Autocadastro público de morador **restaurado**: pages `/register` (escolhe condomínio) e `/register/[condominiumId]` (QR do síndico) + `POST /api/v1/auth/register` ativos; convite continua disponível como fluxo alternativo.
- Sem `middleware.ts` global — autorização rota a rota; RBAC de MANAGER foi corrigido (commits `a0f153e`, `c310193`) mas a cobertura ainda não é 100%.
- `CLAUDE.md` está **defasado** vs schema, rotas e features reais (ver §20).
- Débito menor: métodos de repositório virando código morto (Inspection/Partner); `DeterministicEvaluator` com cobertura de testes baixa.

---

## 2. STACK E ESTRUTURA

| Camada | Implementado |
|--------|--------------|
| Runtime / PM | **Bun 1.3.10** (`packageManager` no `package.json` e Dockerfiles — CLAUDE.md diz 1.3.6) |
| Monorepo | Turborepo (`turbo.json`); workspaces `apps/*`, `packages/*` |
| Frontend / BFF | Next.js 14.2.18 (App Router), React 18.3, TypeScript 5.6 strict |
| Estilo | Tailwind CSS 3.4 + design system "Concreto Verde" (tokens `--rai-*`) |
| ORM / Banco | Prisma 6.6 + PostgreSQL 16 (`pgvector/pgvector:pg16`) |
| Fila | BullMQ 5.76 + Redis 7 (ioredis) |
| Auth | NextAuth.js 4.24 (JWT, CredentialsProvider) |
| Storage | Adapter abstrato — MinIO 8 / AWS S3 (`@aws-sdk/client-s3`) |
| IA / LLM | `@anthropic-ai/sdk` 0.32 — modelos por env var (`ANTHROPIC_MODEL*`); defaults: geral/análise `claude-sonnet-4-6`, extração `claude-haiku-4-5` |
| OCR | `pdf-parse` 2.4 (PDF) + `tesseract.js` 7 (imagens, idioma `por`) |
| Validação | Zod 3.23 nas bordas |
| Email | Resend 6.12 / Nodemailer 8 (SMTP fallback), via `EmailFactory` |
| Push | `web-push` 3.6 (Web Push API) |
| Embeddings | `@huggingface/transformers` 4.2 (dim 384, para RAG de normas) |
| QR Code | `qrcode.react` 4.2 |
| PDF | `pdfkit` 0.18 (geração) + `pdf-parse` 2.4 (extração) |
| Testes | Vitest 2.1 (unit), Playwright 1.60 (E2E, Chromium) |

**Estrutura real (resumida):**

```
/
├── apps/web/
│   ├── app/                      # App Router (páginas + API)
│   │   ├── login/  register/     # auth pública + autocadastro de morador (QR do síndico)
│   │   ├── forgot-password/      # solicita reset de senha
│   │   ├── reset-password/       # confirma novo password via token
│   │   ├── offline/              # PWA offline fallback
│   │   ├── cases/                # área do morador (sem route-group "(client)")
│   │   ├── (admin)/              # dashboard, condominiums, partners, policies,
│   │   │                         #   review-queue, skills, tenants, users, audit
│   │   ├── (condominium)/sindico # dashboard, cases, cadastro (QR)
│   │   ├── (partner)/partner     # dashboard, cases, inspections
│   │   └── api/                  # /api/auth/[...nextauth], /api/health,
│   │                             #   /api/v1/** (ver §9)
│   ├── src/
│   │   ├── modules/              # 12 bounded contexts (domain/app/infra)
│   │   ├── infrastructure/       # auth, database, queue, storage, email, push, embedding
│   │   ├── interfaces/           # components/ui (design system), http/respond+guards
│   │   ├── shared/               # errors, events (só tipos), schemas, logger, cn,
│   │   │                         #   offline-queue (IndexedDB), push-client
│   │   └── workers/              # document-worker.ts (entrypoint standalone)
│   ├── scripts/                  # seed-norms.ts
│   └── tests/e2e/                # specs Playwright + helpers
├── packages/
│   ├── database/                 # schema.prisma, 9 migrations, seed, policies
│   └── templates/                # engine.ts + 6 templates .md
├── docs/agent-teams/             # planejamento de squads (m2/m3)
├── CLAUDE.md  SYSTEM-PROMPT.md  APP-STATE.md
├── AUDIT-RESPONSIVIDADE.md  RELATORIO-APP-ANTIGO.md
└── docker-compose.yml  Dockerfile.web  Dockerfile.worker
```

---

## 3. MODELO DE DADOS (Prisma — estado real)

Schema em `packages/database/prisma/schema.prisma`. **9 migrations aplicadas:**

| Migration | Conteúdo |
|-----------|----------|
| `20260419033213_init` | Schema inicial — 18 modelos base |
| `20260515020000_add_user_condominium_notifications_reportskill` | `User.condominiumId`, `Notification`, `ReportSkill` |
| `20260515020500_add_reporttype_values` | `MEMORIAL_DESCRITIVO`, `CRONOGRAMA` em `ReportType` |
| `20260518022819_add_unit_block` | `Unit.block` |
| `20260523221104_add_password_reset_token` | Campos para reset de senha |
| `20260523223116_add_push_subscription` | `PushSubscription` (Web Push) |
| `20260523233528_add_norm_chunk` | `NormChunk` para embeddings/RAG |
| `20260524000000_norm_chunk_dim_384` | Altera dimensão do embedding para 384 |
| `20260524000911_add_inspection_photo_meta` | Metadados de fotos em inspeções |

**Modelos:** `Tenant`, `Condominium`, `Unit`, `User`, `ReformCase`,
`CaseTransitionLog`, `ChatMessage`, `Document`, `Report`, `ReportSkill`,
`Policy`, `Rule`, `CondominiumPolicy`, `Partner`, `Inspection`,
`CommercialPlan`, `AuditLog`, `Notification`, `PushSubscription`, `NormChunk`.

**Diferenças do schema real vs CLAUDE.md §8 (o CLAUDE.md está defasado):**

| Item | CLAUDE.md §8 | Schema real |
|------|--------------|-------------|
| `User.passwordHash` | ausente | **existe** (hash scrypt) |
| `User.condominiumId` | ausente | **existe** (relação `CondominiumUsers`) |
| `UserRole` | 5 valores | **6** — inclui `MANAGER` |
| `Unit.floor` / `Unit.block` | só `floor` | tem `floor` **e** `block` |
| `Notification` (modelo) | ausente | **existe** (in-app, índice `[userId, read]`) |
| `ReportSkill` (modelo) | ausente | **existe** (`type ReportType @unique`, `skillId`) |
| `ReportType` | 6 valores | **8** — `+ MEMORIAL_DESCRITIVO`, `+ CRONOGRAMA` |
| `Report.skillFileId` | ausente | **existe** |
| `PushSubscription` (modelo) | ausente | **existe** (Web Push API) |
| `NormChunk` (modelo) | ausente | **existe** (pgvector, dim 384, para RAG) |
| `Tenant.cases` (back-relation) | ausente | **existe** |

`generator client` tem `output = "../generated/client"` (cliente gerado em
`packages/database/generated/client/`, versionado no repo).

---

## 4. BOUNDED CONTEXTS — ESTADO POR MÓDULO

Todos em `apps/web/src/modules/`. **12 módulos implementados** (CLAUDE.md documenta 10; `analytics` e `norms` são adições pós-spec):

### case-intake — ✅ implementado
- `domain/entities/CaseStateMachine.ts` — entidade pura; `VALID_TRANSITIONS` bate com CLAUDE.md §6; `assertBusinessRules()` aplica a trava HIGH/CRITICAL → `ELIGIBLE_FOR_RELEASE`.
- `application/TriageAgent.ts` — **único agente com tool-use nativo da Anthropic** (`submit_scope`); stream SSE.
- `application/ClassifyScopeUseCase.ts` — orquestra `ReformScopeSchema` → `PrismaPolicyRepository` → `DeterministicEvaluator` → `CaseStateMachine`.
- `application/CreateCaseUseCase.ts` — faz a transição `DRAFT → AWAITING_SCOPE_DETAILS` via `CaseStateMachine` ✅.
- Testes: `CaseStateMachine.test.ts`, `TriageAgent.test.ts`.

### rule-engine — ✅ implementado
- `domain/DeterministicEvaluator.ts` — puro, sem IA; soma `riskDelta`, faz OR dos flags, teto 100. Thresholds: ≤20 LOW, ≤45 MEDIUM, ≤70 HIGH, senão CRITICAL.
- `domain/types.ts` — interfaces (não há classes `Policy`/`Rule` como esboçado no CLAUDE.md §7).
- `domain/applyOverrides.ts` — aplica sobrescritas de `CondominiumPolicy.overrides` (disable de regras + ajuste de ações) ✅ corrigido.
- `infrastructure/PrismaPolicyRepository.ts` — `resolveForCondominium()` com fallback para política de tenant ou global.
- Testes: `DeterministicEvaluator.test.ts` (3 casos — leve para módulo crítico), `applyOverrides.test.ts`.

### commercial-offers — ✅ implementado
- `domain/PriceCalculator.ts` — `calculatePrice()` puro; garante mínimo 3 vistorias (`Math.max(3, ...)`).
- ⚠️ Recebe `riskLevel` e `mandatoryInspection` mas **não os usa** — preço = `basePrice + extras × unitPrice`.
- `application/CommercialAgent.ts` — Claude (texto, sem tool-use), `temp 0.3`; JSON em `<offer>`; fallback determinístico, nunca lança.
- Testes: `PriceCalculator.test.ts`, `QuoteCaseUseCase.test.ts`.

### document-generation — ✅ implementado
- `application/ClaudeReportAgent.ts` — renderiza template + enriquecimento opcional por IA (`enrichWithAI`).
- `application/GenerateReportUseCase.ts` — mapeia `ReportType → TemplateId`, persiste `Report`, faz upload `.md` no storage.
- `infrastructure/loadCaseRelations.ts` — carrega dados relacionados por tipo de relatório ✅ corrigido.
- `infrastructure/markdownToPdf.ts` — geração de PDF via `pdfkit`.
- ✅ `ReportContentSchema` **força o disclaimer** (`refine`/`includes`) — lança se ausente (CLAUDE.md §13.10).
- Testes: `ClaudeReportAgent.test.ts`, `GenerateReportUseCase.test.ts`, `markdownToPdf.test.ts`.

### document-intelligence — ✅ implementado
- `domain/LLMProvider.ts` — interface (`complete`, `stream`, `completeWithTools`, `streamComplete`).
- `infrastructure/llm/AnthropicProvider.ts` — **único arquivo que importa o SDK**; modelo default `claude-sonnet-4-6` (override global via `ANTHROPIC_MODEL`, por chamada via `CompletionOptions.model`).
- `application/ClaudeDocumentAgent.ts` — extração por tipo de documento; JSON em `<extraction>`; em falha retorna `failure()` (confiança 0), **não lança**.
- `application/ClaudeAnalysisAgent.ts` — coerência cross-document; JSON em `<analysis>`; em falha degrada para `request_corrections` ✅ corrigido.
- Teste: `ClaudeDocumentAgent.test.ts`.

### document-management — ✅ implementado
- `application/UploadDocumentUseCase.ts` — valida MIME (`pdf/jpeg/png/webp`), sobe ao storage, cria `Document`, enfileira job OCR. `origin` determinado pelo papel do usuário ✅ corrigido.
- `domain/DocumentChecklist.ts` — `evaluate()` por risco: LOW nada; MEDIUM `AUTHORIZATION`; HIGH `+ ART_RRT, MEMORIAL`; CRITICAL `+ PROJECT, SCHEDULE, WORKFORCE`.
- `application/GetDocumentUrlUseCase.ts` — signed URL, TTL 3600s.
- Teste: `UploadDocumentUseCase.test.ts`, `documentOrigin.test.ts`.

### identity — ⚠️ implementado, em expansão
- `application/RegisterClientUseCase.ts` — cria `Unit` (se não existe), **reivindica** unidade pré-cadastrada sem morador (preenche `ownerEmail`/`ownerName`) e **rejeita** unidade vinculada a outro e-mail; `User CLIENT` em `$transaction`; grava `lgpdConsentAt`. Rota pública `/api/v1/auth/register` **ativa** (rate-limit por IP e por e-mail).
- `application/CreateInviteUseCase.ts` — convite de usuário (fluxo alternativo ao autocadastro).
- `application/RequestPasswordResetUseCase.ts` — gera token de reset, envia e-mail.
- `application/ConfirmPasswordResetUseCase.ts` — valida token, atualiza senha.
- Testes: `RegisterClient.test.ts`, `CreateInvite.test.ts`, `PasswordReset.test.ts`.

### inspection-scheduling — ✅ implementado
- `domain/InspectionRules.ts` — sequência `INITIAL → INTERMEDIATE? → CRITICAL_SYSTEM? → FINAL`; aplica a regra "Impermeabilização exige INTERMEDIATE concluída antes da FINAL" (CLAUDE.md §13.5, não bypassável).
- Use cases: `Schedule`, `Complete`, `GetCaseInspections` — calculam `extraCharge`, transicionam via `CaseStateMachine`, tudo em `$transaction`.
- ⚠️ Os use cases chamam `prisma.inspection` direto; métodos de repositório viraram código morto.
- Teste: `InspectionRules.test.ts` (maior suíte — 353 linhas).

### notifications — ✅ implementado, mínimo
- `NotifyUserUseCase`, `PrismaNotificationRepository`. `markRead` valida posse. Sem testes.
- ⚠️ Queries filtram só por `userId`, não por `tenantId` (isolamento se mantém transitivamente).

### partner-network — ✅ implementado
- `domain/PartnerMatcher.ts` — filtra por ativo/estado/cidade (wildcard `*`) e especialidade gás/estrutural; ordena engenheiros primeiro para HIGH/CRITICAL.
- Use cases: `Assign`, `PartnerAccept`, `PartnerDecline`, `SetCondominiumPartner` — transacionais com logs.
- **Parceiro fixo do condomínio** (`Condominium.partnerId`): síndico define em `/sindico/parceiro` (`PUT /api/v1/condominiums/:id/partner`); `AssignPartnerUseCase` o prioriza sobre o matcher (`POST /api/v1/cases/:caseId/assign-partner`, acionado pelo síndico/admin). O parceiro fixo vê todos os casos do condomínio (leitura/acompanhamento) via `GET /api/v1/cases` (`assignedToMe: false`), página de detalhe e `assertCaseAccess({ allowPreferredPartnerRead })`; ações (aceite, vistorias) continuam restritas ao parceiro atribuído. Notificações PARTNER priorizam: atribuído > fixo do condomínio > todos.
- ✅ `AssignPartnerUseCase` corrigido: usa `scope.services` (não `servicesNeeded`).
- Testes: `PartnerMatcher.test.ts`, `AssignPartner.test.ts`, `SetCondominiumPartner.test.ts`.

### analytics — ✅ implementado (não documentado no CLAUDE.md)
- `domain/funnel.ts` — calcula funil de casos por status/período.
- `domain/timePerStatus.ts` — tempo médio por status.
- `application/getDashboardAnalytics.ts` — agrega dados para o dashboard admin.
- Teste: `analytics.test.ts`.

### norms — ✅ implementado (não documentado no CLAUDE.md)
- `application/NormSearchService.ts` — busca semântica por embeddings na `NormChunk` table (pgvector).
- `data/nbr16280.ts` — dados brutos da NBR 16280 para seed.
- `infrastructure/NormChunkRepository.ts` — queries pgvector.
- Script: `apps/web/scripts/seed-norms.ts` (`bun run seed:norms`).

**Observações cross-cutting:**
- Vários use cases importam `prisma` direto (pragmático, mas fora do padrão de repositório estrito).
- `shared/events/` contém **só tipos** — não há event bus; o "bus" é um callback opcional injetado no worker.
- Tratamento de erro dos agentes IA é consistente: todos os 5 degradam para fallback (nunca lançam) ✅.

---

## 5. STATE MACHINE DO CASO

`CaseStateMachine` (`case-intake/domain/entities/`) é entidade pura. 17 estados,
mapa `VALID_TRANSITIONS` idêntico ao CLAUDE.md §6. `transition()` lança
`InvalidTransitionError`; `assertBusinessRules()` impede HIGH/CRITICAL irem para
`ELIGIBLE_FOR_RELEASE` sem `HUMAN_REVIEW_REQUIRED` antes. Toda transição grava
`CaseTransitionLog` + `AuditLog` em `$transaction`.

✅ `CreateCaseUseCase` faz `DRAFT → AWAITING_SCOPE_DETAILS` via `CaseStateMachine` (corrigido).

---

## 6. CAMADA DE IA — AGENTES

| Agente | Arquivo | Uso do LLM | Validação |
|--------|---------|-----------|-----------|
| `TriageAgent` | case-intake/application | **tool-use nativo** (`submit_scope`), `temp 0`, stream SSE | `ReformScopeSchema.safeParse` |
| `ClaudeDocumentAgent` | document-intelligence | `complete`, `temp 0`, JSON em `<extraction>` | `DocumentExtractionResultSchema` |
| `ClaudeAnalysisAgent` | document-intelligence | `complete`, `temp 0`, JSON em `<analysis>` | `DocumentAnalysisResultSchema` |
| `ClaudeReportAgent` | document-generation | `complete`, `temp 0.2`, JSON em `<narrative>` | `NarrativeSchema` + `ReportContentSchema` |
| `CommercialAgent` | commercial-offers | `complete`, `temp 0.3`, JSON em `<offer>` | `CommercialOfferOutputSchema` |

- Modelos configuráveis por env (`ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_EXTRACTION`, `ANTHROPIC_MODEL_ANALYSIS`, `ANTHROPIC_MODEL_PHOTOS`); `AnthropicProvider` (infra) segue sendo o único lugar que importa o SDK.
- Toda saída de IA é validada por Zod (CLAUDE.md §9).
- Só o `TriageAgent` usa tool-use real; os outros 4 usam JSON delimitado por tags.
- A IA nunca chama `stateMachine.transition()` — sugere; o application service decide.
- Todos os 5 agentes degradam graciosamente (nunca lançam para fora do agente).

---

## 7. PIPELINE DOCUMENTAL (BullMQ Worker)

`infrastructure/queue/DocumentWorker.ts` — 6 passos idempotentes, fila
`document-processing`, `attempts: 3`, backoff exponencial 2000ms. Cada passo
checa se o documento ainda existe e re-enfileira o próximo:

1. **ocr** — baixa via signed URL 300s; PDF → `pdf-parse`, imagem → `tesseract.js` (`por`); salva `extractedText`.
2. **extraction** — `ClaudeDocumentAgent.extract()`; salva `extractedData` + `inconsistencies`.
3. **validation** — `ClaudeAnalysisAgent.analyze()` cross-document; mapeia recomendação → `DocStatus`; salva `pendencies`; enfileira `checklist` direto.
4. **status-update** — legado, mantido só para jobs em voo de deploys antigos (novo fluxo pula este passo).
5. **checklist** — `DocumentChecklist.evaluate()`; emite evento `checklist.updated`.
6. **emit-event** — emite `document.processed` e resolve o caso de forma determinística (IA sugere → regra valida → `CaseStateMachine` executa), avaliando o **documento mais recente de cada tipo**:
   - `AWAITING_DOCUMENTS`/`PENDING_CORRECTIONS` + tudo válido → `DOCUMENTS_UNDER_REVIEW`;
   - em `DOCUMENTS_UNDER_REVIEW`: doc `INVALID` ou checklist incompleto → `PENDING_CORRECTIONS`; risco HIGH/CRITICAL ou `requiresHumanReview` → `HUMAN_REVIEW_REQUIRED`; tudo `VALID` → `ELIGIBLE_FOR_RELEASE`; algum `VALID_WITH_CAVEATS` → `RELEASED_WITH_CONDITIONS`.
   - Transições usam `updateMany` condicionado ao status de origem (idempotente entre jobs concorrentes), gravam `CaseTransitionLog` + `AuditLog` (com `aiReasoning`) e disparam `CaseNotificationService` fire-and-forget.

Falha permanente (após 3 tentativas) → documento `INVALID` + `AuditLog`
`document.processing.failed`. Entrypoint standalone: `src/workers/document-worker.ts`
(wire das dependências reais — modelos por etapa via `ANTHROPIC_MODEL_*` — + shutdown gracioso SIGTERM/SIGINT).

---

## 8. INFRAESTRUTURA ADICIONAL

### Auth (`src/infrastructure/auth/`)
NextAuth v4, sessão **JWT** (sem tabela de sessão), `CredentialsProvider`. `verifyPassword` aceita **apenas** o formato `scrypt$salt$hash` (node:crypto, `timingSafeEqual`) — branch legado SHA-256 removido ✅. Login e autocadastro têm rate-limit por e-mail/IP (Redis sliding-window, `RateLimiter.ts`). JWT carrega `uid/tenantId/role/condominiumId`. `getSessionUser()` / `requireSessionUser()` para server components e rotas.

### Storage (`src/infrastructure/storage/`)
`createStorageAdapter()` escolhe por `STORAGE_ADAPTER` (`minio`|`s3`). `MinIOAdapter` auto-cria bucket, usa `signingClient` separado (endpoint público opcional `MINIO_PUBLIC_ENDPOINT`). `S3Adapter` não cria bucket (assume IaC). `SIGNED_URL_TTL_SECONDS = 3600`.

### Fila (`src/infrastructure/queue/`)
`QueueManager` é singleton BullMQ (1 `Queue` + 1 `Worker` por nome), conexão `REDIS_URL`, `concurrency: 1`. Única fila: `document-processing`.

### Email (`src/infrastructure/email/`)
`EmailFactory` seleciona `ResendEmailProvider` (Resend API) ou `SmtpEmailProvider` (Nodemailer). `templates.ts` com templates HTML básicos para convites e reset de senha. Falha silenciosa (non-fatal) — e-mail não bloqueia fluxo de negócio.

### Push Notifications (`src/infrastructure/push/`)
`WebPushProvider` — Web Push API via `web-push`. Tabela `PushSubscription` no banco (por usuário). Endpoints de subscribe/unsubscribe. `PwaRegistrar.tsx` no client registra service worker.

### Embeddings (`src/infrastructure/embedding/`)
`EmbeddingProvider` — HuggingFace Transformers (modelo `Xenova/all-MiniLM-L6-v2`, dim 384). Usado por `NormSearchService` para busca semântica na `NormChunk` table (pgvector). Teste: `EmbeddingProvider.test.ts`.

---

## 9. API ROUTES — ESTADO REAL

Prefixo `/api/v1/`. Todas implementadas salvo nota. Auth via `requireSessionUser()`;
sem `middleware.ts` global — autorização rota a rota.

### Autenticação / saúde / público
| Rota | Auth |
|------|------|
| `GET/POST /api/auth/[...nextauth]` | público (NextAuth) |
| `GET /api/health` | público (ping `SELECT 1`) |
| `GET /api/v1/public/condominiums` `/:id` | **público** (autocadastro/convite) |
| `POST /api/v1/auth/register` | **público** — autocadastro de morador (rate-limit IP + e-mail) |
| `POST /api/v1/auth/password-reset/request` | **público** — envia e-mail de reset |
| `POST /api/v1/auth/password-reset/confirm` | **público** — valida token e atualiza senha |

### Casos
| Rota | Função |
|------|--------|
| `POST/GET /api/v1/cases` | criar / listar (CLIENT vê só os próprios) |
| `GET /api/v1/cases/:id` | detalhe (tenant-scoped) |
| `GET/POST /api/v1/cases/:id/messages` | chat de triagem (não-streaming) |
| `GET /api/v1/cases/:id/messages/stream` | chat de triagem **SSE** (usado pela UI) |
| `POST/GET /api/v1/cases/:id/documents` | upload (multipart, 20MB) / listar |
| `GET /api/v1/cases/:id/documents/:id/url` | signed URL |
| `POST /api/v1/cases/:id/documents/analyze` | enfileira OCR (ADMIN/SUPER_ADMIN/CONDOMINIUM) |
| `GET /api/v1/cases/:id/reports` | lista relatórios |
| `POST /api/v1/cases/:id/reports/generate` | gera relatório |
| `GET /api/v1/cases/:id/reports/:id/url` | signed URL do `.md` |
| `GET /api/v1/cases/:id/reports/:id/pdf` | download direto do PDF |
| `POST /api/v1/cases/:id/commercial/quote` | gera proposta (ADMIN/SUPER_ADMIN/CONDOMINIUM) |
| `POST /api/v1/cases/:id/commercial/accept` | aceita proposta |
| `GET/POST /api/v1/cases/:id/inspections` | listar / agendar |
| `GET/PATCH /api/v1/cases/:id/inspections/:id` | detalhe / reagendar |
| `PATCH /api/v1/cases/:id/inspections/:id/complete` | concluir vistoria |
| `POST /api/v1/cases/:id/inspections/:id/photos` | upload de fotos de vistoria |

### Admin (`ADMIN` | `SUPER_ADMIN`)
`GET /admin/dashboard`, `GET /admin/review-queue`, `POST /admin/review/:caseId`,
`GET/POST /admin/policies` + `PATCH/DELETE /:id` + `PATCH /:id/rules`,
`GET/POST /admin/condominiums` + `PATCH/DELETE /:id` + `units` (CRUD),
`GET/POST /admin/partners` + `PATCH/DELETE /:id`,
`POST /admin/norms/search` (busca semântica NBR 16280),
`GET /admin/audit` (log de auditoria).

### Superadmin (só `SUPER_ADMIN`)
`GET/POST /superadmin/tenants` + `PATCH /:id`,
`GET/POST /superadmin/users` + `PATCH /:id` + `/invite` + `/:id/reset-password` + `/:id/impersonate`,
`GET /superadmin/condominiums`,
`GET /superadmin/report-skills` + `PUT /:type`.

### Parceiros / notificações / units
`GET /partners`, `GET /partners/:id/cases`, `POST /partners/:id/cases/:id/accept|decline`,
`GET /notifications` + `PATCH /:id`,
`POST /notifications/push/subscribe` + `/unsubscribe`,
`GET /units`.

**Pontos de atenção:** RBAC de MANAGER foi corrigido nos painéis admin (commits `a0f153e`, `c310193`) — role verificado via `Set` com `MANAGER` incluído. Verificação de posse de caso via `assertCaseAccess` em `interfaces/http/guards.ts`.

---

## 10. PÁGINAS FRONTEND

Todas as páginas estão **construídas com UI real** — nenhum stub/placeholder.

| Perfil | Páginas |
|--------|---------|
| Público | `/` (landing), `/login`, `/forgot-password`, `/reset-password` |
| Público | `/register` (escolhe condomínio), `/register/[condominiumId]` (form + auto-login → `/cases`) |
| Morador (CLIENT) | `/cases`, `/cases/[caseId]` (chat SSE), `/cases/[caseId]/documents` |
| Admin / Superadmin | `/dashboard`, `/review-queue` `+ /[caseId]`, `/condominiums`, `/partners`, `/policies`, `/audit` |
| Superadmin | `/skills`, `/tenants`, `/users` (nav extra no layout) |
| Síndico (CONDOMINIUM) | `/sindico/dashboard`, `/sindico/cases`, `/sindico/parceiro` (parceiro fixo), `/sindico/cadastro` (QR) |
| Parceiro (PARTNER) | `/partner/dashboard`, `/partner/cases` `+ /[caseId]`, `.../inspections` `+ /[id]/complete` |
| PWA | `/offline` (fallback service worker) |

Login faz redirect por role (CONDOMINIUM→sindico, PARTNER→partner, ADMIN→dashboard, senão→cases).
`ImpersonationBanner` na UI exibe alerta quando SUPER_ADMIN está impersonando outro usuário.

---

## 11. FEATURES ALÉM DO CLAUDE.md

### Recuperação de Senha
- Páginas `/forgot-password` e `/reset-password` implementadas.
- Backend: `RequestPasswordResetUseCase` (gera token + envia e-mail), `ConfirmPasswordResetUseCase` (valida token + atualiza hash).
- Migration `add_password_reset_token` adiciona campos ao schema.
- Email enviado via `EmailFactory` (Resend ou SMTP).

### PWA / Push Notifications
- `PwaRegistrar.tsx` registra service worker no client.
- `/offline/page.tsx` — fallback PWA offline.
- `WebPushProvider` + `PushSubscription` model — SUPER_ADMIN pode enviar push a usuários.
- Endpoints `subscribe`/`unsubscribe`.

### Busca de Normas (RAG)
- Tabela `NormChunk` (pgvector dim 384) — chunks da NBR 16280 com embeddings.
- `NormSearchService` — busca semântica por similaridade de coseno.
- `EmbeddingProvider` (HuggingFace, local, sem API externa).
- Seed via `bun run seed:norms`.
- Endpoint `POST /admin/norms/search` — busca por texto livre.

### Painel Superadmin
- `/tenants` e `/users` — cria/ativa/desativa tenants e usuários.
- **Impersonation** — `POST /superadmin/users/:id/impersonate` retorna sessão temporária; `ImpersonationBanner` indica contexto ao admin.
- **Convite de usuário** — `POST /superadmin/users/invite` + `CreateInviteUseCase`.
- **Reset de senha admin** — `POST /superadmin/users/:id/reset-password`.

### Autocadastro por QR Code (síndico)
- Síndico em `/sindico/cadastro` → `RegistrationQrCard` gera QR apontando para `/register/[condominiumId]`.
- Morador se cadastra, unidade é criada ou reivindicada (se pré-cadastrada sem morador), login automático e cai em `/cases` para iniciar a triagem.
- Síndico recebe notificação in-app (+ e-mail se provider configurado) a cada novo cadastro.

### Report Skills (modelo `ReportSkill`)
- `/skills` (SUPER_ADMIN) — cola Anthropic Agent Skill ID para `MEMORIAL_DESCRITIVO` e `CRONOGRAMA`.
- `SKILL_TYPES` hardcoded nesses 2 tipos.
- Seed cria 1 `ReportSkill` ("Memorial Descritivo NBR 16280").

### Notificações In-App
- `NotificationBell` na sidebar — auto-fetch ao montar, badge de não-lidas, marca lida ao clicar.

### Log de Auditoria
- Página `/audit` (ADMIN/SUPER_ADMIN) com filtros.
- Endpoint `GET /admin/audit`.
- Todo evento relevante grava `AuditLog` (`action`, `triggeredBy`, `aiReasoning`).

### Analytics de Dashboard
- Módulo `analytics` — funil por status, tempo médio por estado.
- `getDashboardAnalytics.ts` alimenta `/admin/dashboard`.

---

## 12. SEED / USUÁRIOS DE TESTE

`packages/database/prisma/seed.ts` — duas fases:

- **`seedEssential()`** — sempre roda (inclusive prod): cria a "Política Padrão Global" (`tenantId: null`) com **14 regras** de `data/policies.ts` (idênticas ao CLAUDE.md §7), e faz upsert de 1 `ReportSkill`.
- **`seedDemo()`** — só com `SEED_DEMO=true`: tenant `Demo Administradora`, 1 condomínio, 3 units, **13 ReformCases** (`RF-DEMO-*`) cobrindo o ciclo de vida, 1 Partner, 1 CommercialPlan, 4 Inspections.

**Usuários demo (senha `senha123`, hash scrypt):**

| Email | Role |
|-------|------|
| admin@demo.com | SUPER_ADMIN |
| sindico@demo.com | CONDOMINIUM (vinculado ao condomínio) |
| morador@demo.com | CLIENT |
| parceiro@demo.com | PARTNER |

`create-admin.ts` (`bun run db:create-admin`) — script seguro para prod: cria
tenant `ADMIN` + usuário `SUPER_ADMIN` a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`
(senha ≥12 chars).

---

## 13. TEMPLATES & DESIGN SYSTEM

**Templates** (`packages/templates/`): `engine.ts` → `renderTemplate(id, vars)`
substitui `{{ var }}`, troca faltantes por `[CAMPO NÃO PREENCHIDO]`, valida o id
contra allow-list e **sempre anexa o disclaimer obrigatório**. 6 arquivos `.md`:
`relatorio-analise`, `memorial-descritivo`, `cronograma-basico`,
`parecer-pendencias`, `proposta-comercial`, `ordem-servico`.

**Design system "Concreto Verde"** (`src/interfaces/components/ui/`, 18
componentes base + 6 smart, white-label via `--rai-*`):

- **Base (18):** `Icon`, `Eyebrow`, `Logo`, `Button`, `Input`, `Select`, `Checkbox`, `Switch`, `Badge`, `Card`, `Avatar`, `RiskBadge`, `StatusChip`, `CaseCard`, `Timeline`, `ChatMessage`, `AppShell`, `TopBar`.
- **Smart (6):** `AuthProvider`, `NotificationBell`, `RegistrationQrCard`, `SignOutButton`, `ImpersonationBanner`, `PwaRegistrar`.

---

## 14. TESTES / COBERTURA

**Unit (Vitest)** — 21 arquivos:

| Módulo/Subsistema | Arquivo(s) de teste |
|---|---|
| rule-engine | `DeterministicEvaluator.test.ts` (3 casos), `applyOverrides.test.ts` |
| case-intake | `CaseStateMachine.test.ts`, `TriageAgent.test.ts` |
| commercial-offers | `PriceCalculator.test.ts`, `QuoteCaseUseCase.test.ts` |
| document-generation | `ClaudeReportAgent.test.ts`, `GenerateReportUseCase.test.ts`, `markdownToPdf.test.ts` |
| document-intelligence | `ClaudeDocumentAgent.test.ts` |
| document-management | `UploadDocumentUseCase.test.ts`, `documentOrigin.test.ts` |
| identity | `CreateInvite.test.ts`, `PasswordReset.test.ts` |
| inspection-scheduling | `InspectionRules.test.ts` (353 linhas — maior suíte) |
| partner-network | `PartnerMatcher.test.ts`, `AssignPartner.test.ts`, `SetCondominiumPartner.test.ts` |
| analytics | `analytics.test.ts` |
| infrastructure/storage | `MinIOAdapter.test.ts` |
| infrastructure/queue | `DocumentWorker.test.ts` |
| infrastructure/embedding | `EmbeddingProvider.test.ts` |
| interfaces/http | `guards.test.ts` |
| packages/templates | `engine.test.ts` |

**E2E (Playwright, Chromium, `:3100`)** — 5 specs, 13 testes: `auth` (4),
`case-intake` (3), `document-upload` (3), `triage-chat` (1, pulado sem
`ANTHROPIC_API_KEY`), `admin-review` (2).

**Sem cobertura:** `S3Adapter`, `QueueManager`, `StorageFactory`, config
NextAuth (`auth.ts`/`getSessionUser`/`password.ts`), worker entrypoint,
`respond.ts`, componentes UI, scripts de seed, painéis síndico/parceiro (sem E2E),
`NormSearchService`.

---

## 15. BUILD / DEPLOY

- **`Dockerfile.web`** — multi-stage `oven/bun:1.3.10`; `runtime` roda `prisma migrate deploy` + `next start`. Não usa output `standalone` do Next (imagem maior que o necessário).
- **`Dockerfile.worker`** — mesmo padrão; `CMD` roda `src/workers/document-worker.ts`.
- **`docker-compose.yml`** — Postgres (porta `5433:5432`), Redis (`6379`), MinIO (`9000`/`9001`) com healthchecks.
- **Produção:** Dokploy/Swarm — o app de prod usa o banco do swarm; o `.env` do repo aponta para um banco dev diferente. Operar prod via `docker exec` no container web.

---

## 16. VARIÁVEIS DE AMBIENTE

```env
# Banco (dev: porta 5433 — docker-compose mapeia 5433:5432)
DATABASE_URL=postgresql://reformai:reformai_dev@localhost:5433/reformai

REDIS_URL=redis://localhost:6379
NEXTAUTH_SECRET=change-me-in-production
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=

# Storage (minio | s3)
STORAGE_ADAPTER=minio
MINIO_ENDPOINT=localhost:9000
MINIO_PUBLIC_ENDPOINT=       # opcional: endpoint público para signed URLs (browser)
MINIO_ACCESS_KEY=reformai
MINIO_SECRET_KEY=reformai_dev
MINIO_BUCKET=reformai

# S3 (quando STORAGE_ADAPTER=s3)
# AWS_REGION=  AWS_ACCESS_KEY_ID=  AWS_SECRET_ACCESS_KEY=  AWS_S3_BUCKET=

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Email (Resend ou SMTP)
RESEND_API_KEY=              # se presente, usa Resend
SMTP_HOST=  SMTP_PORT=  SMTP_USER=  SMTP_PASS=  SMTP_FROM=  # fallback SMTP

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:...

# Seed demo
SEED_DEMO=false
```

---

## 17. COMANDOS

```bash
docker-compose up -d        # Postgres + Redis + MinIO
bun install                 # dependências do monorepo
bun run db:migrate          # prisma migrate dev
bun run db:generate         # prisma generate
bun run db:seed             # seed (SEED_DEMO=true para dados demo)
bun run db:create-admin     # cria SUPER_ADMIN de produção
bun run dev                 # Next.js dev (turbo)
bun run test                # Vitest (unit)
bun run test:e2e            # Playwright (E2E)
bun run seed:norms          # seed da NormChunk (NBR 16280 embeddings)
bun run --cwd apps/web src/workers/document-worker.ts   # worker standalone
```

---

## 18. DIVERGÊNCIAS DO CLAUDE.md (resumo)

O `CLAUDE.md` é a fonte-de-verdade da **especificação**, mas está **defasado** vs
o código atual. Divergências conhecidas:

1. **Schema** — `User.passwordHash`/`condominiumId`, `UserRole.MANAGER`, `Unit.block`, modelos `Notification`, `ReportSkill`, `PushSubscription`, `NormChunk`; `ReportType` com 8 valores; `Report.skillFileId` (ver §3).
2. **API** — não existem `/auth/login`, `/auth/refresh`, `/cases/:id/status`, `/admin/templates`. Existem (não documentados): `/superadmin/*`, `/notifications`, `/notifications/push/*`, `/public/condominiums`, `/auth/password-reset/*`, `/units`, `/admin/norms/search`, `/admin/audit`, `/cases/:id/reports/:id/pdf`, `/cases/:id/inspections/:id/photos`.
3. **Bun** — CLAUDE.md diz 1.3.6; manifests/Dockerfiles usam 1.3.10.
4. **Event bus** — CLAUDE.md §5 lista `shared/events/` como event bus; na prática só há tipos + callback no worker.
5. **Route group `(client)`** — não usado; a área do morador é `app/cases/`.
6. **Bounded contexts** — CLAUDE.md documenta 10; existem 12 (`analytics`, `norms`).
7. ~~**Autocadastro público**~~ — restaurado; CLAUDE.md e código estão alinhados (convite permanece como fluxo alternativo).
8. **Infraestrutura adicional** — email, push, rate-limiter, embedding não documentados no CLAUDE.md.

---

## 19. BUGS E PENDÊNCIAS CONHECIDAS

| # | Item | Severidade |
|---|------|-----------|
| ~~1~~ | ~~`AssignPartnerUseCase` lê `scope.servicesNeeded` — campo inexistente~~ | ✅ corrigido |
| ~~2~~ | ~~`/login`: "Esqueci a senha" morto; sem fluxo de reset~~ | ✅ corrigido (páginas + backend implementados) |
| ~~3~~ | ~~POSTs de mudança de estado sem verificação de role nem posse~~ | ✅ corrigido (RBAC via `assertCaseAccess`; commits `a0f153e`, `c310193`) |
| ~~4~~ | ~~`CreateCaseUseCase` transicionava o caso sem `CaseStateMachine`~~ | ✅ corrigido |
| ~~5~~ | ~~`ClaudeAnalysisAgent` lança em falha~~ | ✅ corrigido (degrada para `request_corrections`) |
| 6 | `PriceCalculator` ignora `riskLevel`/`mandatoryInspection` — risco não afeta preço | Baixa |
| ~~7~~ | ~~`RegisterClientUseCase` sem transação — falha parcial deixa `Unit` órfã~~ | ✅ corrigido (`$transaction`) |
| ~~8~~ | ~~`CondominiumPolicy.overrides` lido mas nunca aplicado~~ | ✅ corrigido (`applyOverrides`) |
| ~~9~~ | ~~`GenerateReportUseCase` deixa variáveis de template como `undefined`~~ | ✅ corrigido (`loadCaseRelations`) |
| ~~10~~ | ~~Branch legado SHA-256 de senha~~ | ✅ removido |
| ~~11~~ | ~~`documents` grava `origin` fixo em `CLIENT`~~ | ✅ corrigido (origin por papel) |
| 12 | Métodos de repositório virando código morto (Inspection/Partner) por uso direto de `prisma` | Baixa (limpeza) |
| 13 | `DeterministicEvaluator` (módulo crítico) com apenas 3 casos de teste | Baixa (cobertura) |
| ~~14~~ | ~~Pages `/register` órfãs com API desativada~~ | ✅ corrigido (autocadastro restaurado ponta a ponta; redirect `/register→/login` removido do `next.config.mjs`) |
| 15 | `NormSearchService` sem testes unitários | Baixa |
| 16 | VAPID keys e SMTP não configurados no seed/docker-compose — push e e-mail falham silenciosamente em dev | Informativa |

---

## 20. PRÓXIMOS PASSOS SUGERIDOS

1. Ampliar cobertura de testes do `DeterministicEvaluator` (#19.13) e adicionar testes para `NormSearchService` (#19.15).
2. Documentar no `CLAUDE.md` os bounded contexts `analytics` e `norms`, o módulo de email/push e as novas migrations (§18.1, §18.6, §18.8).
3. Limpar métodos de repositório mortos em `Inspection`/`Partner` (#19.12).
5. Decidir se `PriceCalculator` deve usar `riskLevel` para precificação diferenciada (#19.6).
6. Configurar VAPID keys no `docker-compose.yml` para push funcionar em dev (#19.16).

---

## 21. PRONTIDÃO PARA PRODUÇÃO (adendo 2026-06-01)

Hardening de produção implementado no branch `claude/app-production-readiness-dJdCn`.
Build, typecheck, lint e testes (176, 26 arquivos) verdes.

### Higiene
- Removida a página de homologação `/error-preview` (+ item de nav do SUPER_ADMIN)
  e arquivos soltos da raiz (`errors-1.jsx`, `errors-2.jsx`, `error-handling.html`,
  `package-lock.json` — projeto é Bun).
- Suíte de testes corrigida (`vi.hoisted` no `CaseNotificationService`; assert do
  `GetPendingActionsUseCase`).

### LGPD (`identity/application`)
- `ExportUserDataUseCase` → `GET /api/v1/me/data-export` (acesso/portabilidade; JSON).
- `AnonymizeUserUseCase` (anonimização, **não** hard delete — preserva casos/auditoria
  sem PII) → `POST /api/v1/me/account/delete` (auto-serviço, `{ confirm: true }`) e
  `POST /api/v1/superadmin/users/:id/anonymize` (a pedido, via operador). Teste:
  `AnonymizeUserUseCase.test.ts`.

### Rate-limit por usuário (`infrastructure/rate-limiter/guards.ts`)
- `enforceUserRateLimit` + `BUCKETS` aplicados a rotas custosas: chat (POST e SSE),
  geração de relatório, análise de documentos, proposta comercial e upload.
  Redis sliding-window, fail-open. Complementa o rate-limit por IP de auth/registro.

### Monitoramento de erros (`infrastructure/monitoring/sentry.ts`)
- `@sentry/node` (compatível com Sentry SaaS ou GlitchTip self-hosted), ativado por
  `SENTRY_DSN`; **no-op** sem DSN. Marcado como external no `next.config.mjs`.
- Capturado em: `respond.ts` (500s de API), worker (`document-worker` fatal +
  `DocumentWorker.handlePermanentFailure`) e cliente via beacon
  `POST /api/v1/monitoring/client-error` (ligado a `error.tsx`/`global-error.tsx`).

### Visibilidade de configuração (`infrastructure/config/configStatus.ts`)
- `instrumentation.ts` (hook habilitado) loga o status dos subsistemas no boot e
  alerta (WARN/ERROR) sobre ausências críticas/degradadas (e-mail/push/redis/monitor).
- `GET /api/v1/admin/system-status` (ADMIN/SUPER_ADMIN) — config + liveness do banco.

### Pendências remanescentes (não bloqueantes)
- Cobertura E2E dos fluxos novos (síndico, specialists), `PriceCalculator` x `riskLevel`,
  backup do Postgres no Dokploy, e UI para os endpoints LGPD (hoje só API).
