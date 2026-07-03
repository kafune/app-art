# CLAUDE.md — Plataforma SaaS ART/RRT
# Reformas em Unidades Autônomas de Condomínios

> Fonte de verdade do projeto. Leia inteiro antes de qualquer ação.
> Em caso de conflito entre este arquivo e qualquer outro prompt, este arquivo vence.

---

## 1. VISÃO DO PRODUTO

**Nome provisório:** ReformAI (white-label — configurável por tenant)

Plataforma SaaS B2B2C multi-tenant para triagem técnica, análise documental, liberação operacional e encaminhamento para responsável técnico parceiro em reformas de unidades autônomas de condomínios.

**Restrição fundamental:** O sistema não emite ART/RRT. A emissão formal é responsabilidade exclusiva do profissional habilitado parceiro. Todo documento gerado por IA carrega disclaimer explícito sobre isso.

**Posição:** Assistente técnico-operacional de reformas prediais. Orientado por IA, governado por regras determinísticas, auditável em cada decisão.

---

## 2. PRINCÍPIOS DE ENGENHARIA

1. **State-driven.** O caso tem estados explícitos, transições validadas e histórico completo.
2. **IA assistiva, não soberana.** IA interpreta, normaliza, sugere, extrai e gera texto. Não altera estado crítico sem regra determinística ou revisão humana.
3. **Auditabilidade total.** Toda decisão operacional relevante — automática ou humana — é registrada com contexto.
4. **Multi-tenant como fundação.** Não como feature. Isolamento por tenant em toda a modelagem desde o primeiro commit.
5. **DDD com separação de camadas.** `domain` → `application` → `infrastructure` → `interfaces`. Regra de negócio nunca fica em controller, componente UI ou prompt.
6. **Bounded contexts com fronteiras.** Módulos não conhecem os internos uns dos outros. Comunicação por interfaces e eventos de domínio.
7. **Simples, robusto, evolutivo.** Sem overengineering. Sem débito estrutural grave.

---

## 3. STACK TÉCNICA

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 14+ (App Router), TypeScript, Tailwind CSS, design system próprio "Concreto Verde" |
| Backend / BFF | Next.js API Routes (MVP) → Fastify standalone (pós-MVP) |
| ORM | Prisma |
| Banco principal | PostgreSQL 16 |
| Fila | BullMQ + Redis |
| Auth | NextAuth.js (JWT, RBAC) |
| Storage | Abstrato via adapter — MinIO local, S3/Supabase em produção |
| IA / LLM | Anthropic Claude API — acesso exclusivo via `LLMProvider` abstrato |
| OCR | Tesseract.js (MVP) → AWS Textract (pós-MVP) |
| RAG | pgvector (extensão PostgreSQL) |
| Validação | Zod em todas as bordas do sistema |
| Testes | Vitest (unitários), Playwright (E2E nas telas críticas) |
| Runtime / Package Manager | **Bun 1.3.10** — usado em todo o monorepo (bun install, bun run, bun test) |

---

## 4. BOUNDED CONTEXTS E MÓDULOS

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLATAFORMA                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Identity &  │  │   Tenancy    │  │    Case Intake       │  │
│  │   Access     │  │              │  │  (Triagem via chat)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │    Work      │  │    Rule      │  │    Document          │  │
│  │Classification│  │    Engine    │  │    Management        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Document    │  │  Document    │  │    Commercial        │  │
│  │Intelligence  │  │ Generation   │  │      Offers          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Partner    │  │  Inspection  │  │  Audit &             │  │
│  │   Network    │  │  Scheduling  │  │  Observability       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Regra:** Nenhum módulo importa internals de outro. Comunicação via interfaces públicas e eventos de domínio.

---

## 5. ESTRUTURA DE PASTAS

```
/
├── apps/
│   └── web/
│       ├── app/                             # Next.js App Router
│       │   ├── login/                       # Tela de login
│       │   ├── register/                    # Autocadastro (escolhe condomínio)
│       │   │   └── [condominiumId]/         # Formulário de cadastro por condomínio
│       │   ├── cases/                       # Área do morador (sem route group)
│       │   │   └── [caseId]/
│       │   │       └── documents/
│       │   ├── (admin)/                     # Admin + Superadmin
│       │   │   ├── dashboard/
│       │   │   ├── condominiums/
│       │   │   ├── partners/
│       │   │   ├── policies/
│       │   │   ├── review-queue/
│       │   │   ├── skills/                  # Superadmin: Report Skills
│       │   │   ├── tenants/                 # Superadmin: gestão de tenants
│       │   │   └── users/                   # Superadmin: gestão de usuários
│       │   ├── (condominium)/sindico/       # Painel do síndico
│       │   │   ├── dashboard/
│       │   │   ├── cases/
│       │   │   └── cadastro/               # QR code de autocadastro
│       │   └── (partner)/partner/           # Painel do parceiro
│       │       ├── dashboard/
│       │       ├── review/[caseId]/         # Fila de revisão técnica (parecer do parceiro)
│       │       └── cases/[caseId]/inspections/
│       ├── src/
│       │   ├── modules/                     # 10 bounded contexts
│       │   │   ├── case-intake/
│       │   │   │   ├── domain/
│       │   │   │   │   ├── entities/
│       │   │   │   │   │   └── CaseStateMachine.ts   # entidade pura
│       │   │   │   │   └── repositories/             # interfaces
│       │   │   │   ├── application/
│       │   │   │   │   ├── CreateCaseUseCase.ts
│       │   │   │   │   ├── ClassifyScopeUseCase.ts
│       │   │   │   │   └── TriageAgent.ts            # tool-use Claude
│       │   │   │   └── infrastructure/repositories/  # Prisma
│       │   │   ├── rule-engine/
│       │   │   │   ├── domain/
│       │   │   │   │   ├── DeterministicEvaluator.ts
│       │   │   │   │   └── types.ts                  # interfaces Policy/Rule/Result
│       │   │   │   └── infrastructure/
│       │   │   ├── document-management/
│       │   │   ├── document-intelligence/
│       │   │   │   ├── domain/
│       │   │   │   │   └── LLMProvider.ts            # interface — nunca importa SDK
│       │   │   │   └── infrastructure/llm/
│       │   │   │       └── AnthropicProvider.ts      # único import do SDK
│       │   │   ├── document-generation/
│       │   │   ├── commercial-offers/
│       │   │   ├── partner-network/
│       │   │   ├── inspection-scheduling/
│       │   │   ├── notifications/
│       │   │   └── identity/                         # só autocadastro (CLIENT)
│       │   ├── infrastructure/
│       │   │   ├── auth/                             # NextAuth, getSessionUser, password
│       │   │   ├── database/                         # Prisma client singleton
│       │   │   ├── storage/
│       │   │   │   ├── StorageAdapter.ts             # interface + buildStorageKey
│       │   │   │   ├── StorageFactory.ts             # seleciona MinIO ou S3
│       │   │   │   ├── MinIOAdapter.ts
│       │   │   │   └── S3Adapter.ts
│       │   │   └── queue/                            # BullMQ QueueManager + DocumentWorker
│       │   ├── interfaces/
│       │   │   ├── components/ui/                    # design system "Concreto Verde"
│       │   │   └── http/respond.ts                   # unauthorized(), forbidden(), handleError()
│       │   ├── shared/
│       │   │   ├── errors/                           # DomainError e subclasses
│       │   │   ├── events/                           # tipos de evento (sem bus implementado)
│       │   │   ├── schemas/                          # ReformScopeSchema (Zod)
│       │   │   └── logger.ts
│       │   └── workers/
│       │       └── document-worker.ts                # entrypoint standalone BullMQ
│       └── tests/e2e/                                # specs Playwright
├── packages/
│   ├── database/                                     # schema.prisma + 4 migrations + seed
│   └── templates/                                    # engine.ts + 6 templates Markdown
│       ├── relatorio-analise.md
│       ├── memorial-descritivo.md
│       ├── cronograma-basico.md
│       ├── parecer-pendencias.md
│       ├── proposta-comercial.md
│       └── ordem-servico.md
├── docs/
├── CLAUDE.md
├── APP-STATE.md                                      # snapshot do estado real do código
├── SYSTEM-PROMPT.md
├── Dockerfile.web  Dockerfile.worker
└── docker-compose.yml
```

---

## 6. STATE MACHINE DO CASO

### Estados

```typescript
enum CaseStatus {
  DRAFT                    = 'draft',
  AWAITING_SCOPE_DETAILS   = 'awaiting_scope_details',
  SCOPE_CLASSIFIED         = 'scope_classified',
  AWAITING_SYNDIC_APPROVAL = 'awaiting_syndic_approval',
  AWAITING_DOCUMENTS       = 'awaiting_documents',
  DOCUMENTS_UNDER_REVIEW   = 'documents_under_review',
  PENDING_CORRECTIONS      = 'pending_corrections',
  ELIGIBLE_FOR_RELEASE     = 'eligible_for_release',
  RELEASED_WITH_CONDITIONS = 'released_with_conditions',
  HUMAN_REVIEW_REQUIRED    = 'human_review_required',
  COMMERCIAL_OFFER_SENT    = 'commercial_offer_sent',
  AWAITING_PAYMENT         = 'awaiting_payment',
  ASSIGNED_TO_PARTNER      = 'assigned_to_partner',
  ART_RRT_PENDING          = 'art_rrt_pending',
  INSPECTIONS_SCHEDULED    = 'inspections_scheduled',
  IN_EXECUTION             = 'in_execution',
  CONCLUDED                = 'concluded',
  ARCHIVED                 = 'archived',
}
```

### Mapa de transições válidas

```
DRAFT
  → AWAITING_SCOPE_DETAILS

AWAITING_SCOPE_DETAILS
  → SCOPE_CLASSIFIED
  → HUMAN_REVIEW_REQUIRED

SCOPE_CLASSIFIED
  → AWAITING_SYNDIC_APPROVAL
  → AWAITING_DOCUMENTS
  → COMMERCIAL_OFFER_SENT
  → ELIGIBLE_FOR_RELEASE
  → HUMAN_REVIEW_REQUIRED

AWAITING_SYNDIC_APPROVAL
  → AWAITING_DOCUMENTS            # síndico aprova
  → ARCHIVED                     # síndico recusa

AWAITING_DOCUMENTS
  → DOCUMENTS_UNDER_REVIEW

DOCUMENTS_UNDER_REVIEW
  → ELIGIBLE_FOR_RELEASE
  → RELEASED_WITH_CONDITIONS
  → PENDING_CORRECTIONS
  → HUMAN_REVIEW_REQUIRED

PENDING_CORRECTIONS
  → DOCUMENTS_UNDER_REVIEW
  → HUMAN_REVIEW_REQUIRED

ELIGIBLE_FOR_RELEASE
  → CONCLUDED
  → ASSIGNED_TO_PARTNER

RELEASED_WITH_CONDITIONS
  → ASSIGNED_TO_PARTNER

HUMAN_REVIEW_REQUIRED
  → ELIGIBLE_FOR_RELEASE
  → RELEASED_WITH_CONDITIONS
  → PENDING_CORRECTIONS
  → ARCHIVED

COMMERCIAL_OFFER_SENT
  → AWAITING_PAYMENT
  → ARCHIVED

AWAITING_PAYMENT
  → ASSIGNED_TO_PARTNER

ASSIGNED_TO_PARTNER
  → ART_RRT_PENDING
  → COMMERCIAL_OFFER_SENT

ART_RRT_PENDING
  → INSPECTIONS_SCHEDULED

INSPECTIONS_SCHEDULED
  → IN_EXECUTION

IN_EXECUTION
  → CONCLUDED
```

### Regras obrigatórias de transição

1. Toda transição é registrada em `CaseTransitionLog` com `fromStatus`, `toStatus`, `triggeredBy`, `reason` e `timestamp`.
2. Transição inválida lança `InvalidTransitionError`. Nunca silenciosa.
3. **Casos HIGH ou CRITICAL nunca vão para `ELIGIBLE_FOR_RELEASE` sem passar por `HUMAN_REVIEW_REQUIRED`.**
4. `CaseStateMachine` é entidade de domínio pura — não existe em controller, route ou componente.

```typescript
// case-intake/domain/entities/CaseStateMachine.ts
class CaseStateMachine {
  private static readonly VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = { /* mapa acima */ }

  constructor(private current: CaseStatus, private riskLevel: RiskLevel | null) {}

  transition(to: CaseStatus, context: TransitionContext): CaseStatus {
    if (!this.isValid(this.current, to)) {
      throw new InvalidTransitionError(this.current, to)
    }
    this.assertBusinessRules(to, context)
    return to
  }

  private assertBusinessRules(to: CaseStatus, ctx: TransitionContext) {
    if (
      to === CaseStatus.ELIGIBLE_FOR_RELEASE &&
      (this.riskLevel === 'HIGH' || this.riskLevel === 'CRITICAL') &&
      ctx.previousStatus !== CaseStatus.HUMAN_REVIEW_REQUIRED
    ) {
      throw new BusinessRuleViolationError('HIGH/CRITICAL cases require human review before release')
    }
  }
}
```

---

## 7. MOTOR DE REGRAS (Rule Engine)

### Princípio

Módulo de domínio independente. Avalia políticas contra o escopo da obra. Retorna resultado determinístico e explicável. Nenhuma lógica de classificação fica em prompt de IA.

**Fluxo:**
```
ReformScope + Policy → DeterministicEvaluator → PolicyEvaluationResult
```

### Entidades de domínio

```typescript
// rule-engine/domain/entities/Policy.ts
interface Policy {
  id: string
  tenantId: string | null       // null = política global
  condominiumId: string | null
  name: string
  rules: Rule[]
  version: number
  effectiveFrom: Date
  active: boolean
}

// rule-engine/domain/entities/Rule.ts
interface Rule {
  id: string
  policyId: string
  name: string
  description: string           // explicação em linguagem simples (exibida no resultado)
  condition: RuleCondition      // { field: keyof ReformScope, operator, value }
  action: RuleAction            // { riskDelta, requiresART, requiresHumanReview, mandatoryInspection }
  priority: number
  active: boolean
  version: number
}

// rule-engine/domain/entities/PolicyEvaluationResult.ts
interface PolicyEvaluationResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  triageScore: number
  requiresART: boolean | 'uncertain'
  requiresHumanReview: boolean
  mandatoryInspection: boolean
  recommendedStatus: CaseStatus
  triggeredRules: Array<{ ruleId: string; ruleName: string; reason: string }>
}
```

### Avaliador determinístico

```typescript
// rule-engine/domain/evaluator/DeterministicEvaluator.ts
class DeterministicEvaluator {
  evaluate(scope: ReformScope, policy: Policy): PolicyEvaluationResult {
    let score = 0
    const triggered: TriggeredRule[] = []

    const sorted = policy.rules
      .filter(r => r.active)
      .sort((a, b) => a.priority - b.priority)

    for (const rule of sorted) {
      if (this.matches(rule.condition, scope)) {
        score += rule.action.riskDelta ?? 0
        triggered.push(rule)
      }
    }

    const riskLevel = this.scoreToRisk(Math.min(score, 100))
    return {
      riskLevel,
      triageScore: Math.min(score, 100),
      requiresART: triggered.some(r => r.action.requiresART),
      requiresHumanReview: triggered.some(r => r.action.requiresHumanReview),
      mandatoryInspection: triggered.some(r => r.action.mandatoryInspection),
      recommendedStatus: this.resolveStatus(riskLevel, triggered),
      triggeredRules: triggered.map(r => ({ ruleId: r.id, ruleName: r.name, reason: r.description })),
    }
  }

  private scoreToRisk(score: number): RiskLevel {
    if (score <= 20) return 'LOW'
    if (score <= 45) return 'MEDIUM'
    if (score <= 70) return 'HIGH'
    return 'CRITICAL'
  }
}
```

### Regras padrão (seed)

| Serviço | riskDelta | requiresART | requiresHumanReview | mandatoryInspection |
|---------|-----------|-------------|----------------------|---------------------|
| Pintura simples | +5 | false | false | false |
| Troca de piso sem demolição | +10 | false | false | false |
| Troca de piso com demolição | +25 | true | false | false |
| Elétrica | +30 | true | false | false |
| Hidráulica | +30 | true | false | false |
| Gás | +40 | true | false | true |
| Impermeabilização | +35 | true | false | true |
| Ar-condicionado (split) | +15 | false | false | false |
| Mudança de layout | +20 | true | false | false |
| Demolição de alvenaria | +40 | true | true | false |
| Impacto estrutural/prumadas | +60 | true | true | true |
| Fachada | +45 | true | true | false |
| Esquadrias externas | +20 | true | false | false |
| Equipamentos fixos pesados | +25 | true | false | false |

---

## 8. MODELAGEM DE DADOS (Prisma)

Schema em `packages/database/prisma/schema.prisma`. Gerador com `output = "../generated/client"`.

```prisma
generator client {
  provider        = "prisma-client-js"
  output          = "../generated/client"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ─── TENANCY ──────────────────────────────────────────────────

model Tenant {
  id           String     @id @default(cuid())
  name         String
  slug         String     @unique
  type         TenantType
  logoUrl      String?
  primaryColor String?
  active       Boolean    @default(true)
  createdAt    DateTime   @default(now())

  condominiums Condominium[]
  users        User[]
  policies     Policy[]
  partners     Partner[]
  plans        CommercialPlan[]
  cases        ReformCase[]
}

enum TenantType { ADMIN ADMINISTRADORA STANDALONE }

model Condominium {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  cnpj      String?
  address   String
  city      String
  state     String
  active    Boolean  @default(true)
  partnerId String?  // parceiro técnico fixo do condomínio (definido pelo síndico/admin)
  createdAt DateTime @default(now())

  tenant      Tenant              @relation(fields: [tenantId], references: [id])
  partner     Partner?            @relation("CondominiumPreferredPartner", fields: [partnerId], references: [id])
  units       Unit[]
  cases       ReformCase[]
  policyLinks CondominiumPolicy[]
  users       User[]              @relation("CondominiumUsers")
}

model Unit {
  id            String  @id @default(cuid())
  condominiumId String
  identifier    String
  block         String?   // bloco (ex: "A", "B")
  floor         String?
  ownerName     String?
  ownerEmail    String?
  ownerPhone    String?

  condominium Condominium  @relation(fields: [condominiumId], references: [id])
  cases       ReformCase[]
}

// ─── IDENTITY ─────────────────────────────────────────────────

model User {
  id             String    @id @default(cuid())
  tenantId       String
  condominiumId  String?   // preenchido para CONDOMINIUM e CLIENT via autocadastro
  email          String    @unique
  name           String
  passwordHash   String    // hash scrypt: "scrypt$<saltHex>$<hashHex>"
  role           UserRole
  active         Boolean   @default(true)
  lgpdConsentAt  DateTime?
  createdAt      DateTime  @default(now())

  tenant        Tenant          @relation(fields: [tenantId], references: [id])
  condominium   Condominium?    @relation("CondominiumUsers", fields: [condominiumId], references: [id])
  cases         ReformCase[]    @relation("ClientCases")
  auditLogs     AuditLog[]
  partner       Partner?
  notifications Notification[]
}

enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  CONDOMINIUM
  CLIENT
  PARTNER
}

// ─── CASE ─────────────────────────────────────────────────────

model ReformCase {
  id               String     @id @default(cuid())
  protocol         String     @unique
  tenantId         String
  condominiumId    String
  unitId           String
  clientId         String
  status           CaseStatus @default(DRAFT)
  riskLevel        RiskLevel?
  requiresART      Boolean?
  triageScore      Int?
  reformScope      Json?      // ReformScope estruturado
  evaluationResult Json?      // PolicyEvaluationResult completo
  partnerId        String?
  commercialPlanId String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  condominium Condominium @relation(fields: [condominiumId], references: [id])
  unit        Unit        @relation(fields: [unitId], references: [id])
  client      User        @relation("ClientCases", fields: [clientId], references: [id])
  partner     Partner?    @relation(fields: [partnerId], references: [id])

  messages    ChatMessage[]
  documents   Document[]
  reports     Report[]
  inspections Inspection[]
  transitions CaseTransitionLog[]
  auditLogs   AuditLog[]
}

enum CaseStatus {
  DRAFT AWAITING_SCOPE_DETAILS SCOPE_CLASSIFIED
  AWAITING_DOCUMENTS DOCUMENTS_UNDER_REVIEW PENDING_CORRECTIONS
  ELIGIBLE_FOR_RELEASE RELEASED_WITH_CONDITIONS HUMAN_REVIEW_REQUIRED
  COMMERCIAL_OFFER_SENT AWAITING_PAYMENT ASSIGNED_TO_PARTNER
  ART_RRT_PENDING INSPECTIONS_SCHEDULED IN_EXECUTION
  CONCLUDED ARCHIVED
}

enum RiskLevel { LOW MEDIUM HIGH CRITICAL }

model CaseTransitionLog {
  id          String     @id @default(cuid())
  caseId      String
  fromStatus  CaseStatus
  toStatus    CaseStatus
  triggeredBy String     // "user:{id}" | "system" | "ai" | "reviewer:{id}"
  reason      String?
  metadata    Json?
  createdAt   DateTime   @default(now())

  case ReformCase @relation(fields: [caseId], references: [id])
}

// ─── CHAT ─────────────────────────────────────────────────────

model ChatMessage {
  id        String      @id @default(cuid())
  caseId    String
  role      MessageRole
  content   String
  metadata  Json?
  createdAt DateTime    @default(now())

  case ReformCase @relation(fields: [caseId], references: [id])
}

enum MessageRole { USER ASSISTANT SYSTEM }

// ─── DOCUMENTS ────────────────────────────────────────────────

model Document {
  id              String       @id @default(cuid())
  caseId          String
  tenantId        String
  type            DocumentType
  version         Int          @default(1)
  fileName        String
  storageKey      String       // chave no storage — nunca URL pública direta
  mimeType        String
  status          DocStatus    @default(PENDING)
  origin          DocOrigin
  extractedText   String?
  extractedData   Json?
  inconsistencies Json?
  pendencies      Json?
  uploadedAt      DateTime     @default(now())

  case ReformCase @relation(fields: [caseId], references: [id])
}

enum DocumentType {
  ART_RRT MEMORIAL PROJECT SCHEDULE WORKFORCE
  WORKER_DOCS AUTHORIZATION PHOTOS INSPECTION_REPORT ART_RRT_FINAL OTHER
}

enum DocStatus { PENDING PROCESSING VALID VALID_WITH_CAVEATS INVALID MISSING }
enum DocOrigin { CLIENT PARTNER SYSTEM }

// ─── REPORTS ──────────────────────────────────────────────────

model Report {
  id          String     @id @default(cuid())
  caseId      String
  tenantId    String
  type        ReportType
  content     String
  skillFileId String?    // ID de arquivo gerado por Agent Skill (opcional)
  version     Int        @default(1)
  generatedAt DateTime   @default(now())

  case ReformCase @relation(fields: [caseId], references: [id])
}

enum ReportType {
  ANALYSIS
  TECHNICAL_OPINION
  COMMERCIAL_PROPOSAL
  SERVICE_ORDER
  INSPECTION_SUMMARY
  RELEASE_OPINION
  MEMORIAL_DESCRITIVO   // gerado via Agent Skill configurável
  CRONOGRAMA            // gerado via Agent Skill configurável
}

// Configuração de qual Agent Skill gera cada tipo de relatório especial
model ReportSkill {
  id        String     @id @default(cuid())
  type      ReportType @unique
  skillId   String     // ID do Anthropic Agent Skill
  name      String
  active    Boolean    @default(true)
  updatedAt DateTime   @updatedAt
}

// ─── RULE ENGINE ──────────────────────────────────────────────

model Policy {
  id            String   @id @default(cuid())
  tenantId      String?  // null = política global
  name          String
  description   String?
  version       Int      @default(1)
  effectiveFrom DateTime @default(now())
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())

  tenant       Tenant?             @relation(fields: [tenantId], references: [id])
  rules        Rule[]
  condominiums CondominiumPolicy[]
}

model Rule {
  id          String  @id @default(cuid())
  policyId    String
  name        String
  description String
  condition   Json    // { field, operator, value }
  action      Json    // { riskDelta, requiresART, requiresHumanReview, mandatoryInspection }
  priority    Int
  active      Boolean @default(true)
  version     Int     @default(1)

  policy Policy @relation(fields: [policyId], references: [id])
}

model CondominiumPolicy {
  condominiumId String
  policyId      String
  overrides     Json?

  condominium Condominium @relation(fields: [condominiumId], references: [id])
  policy      Policy      @relation(fields: [policyId], references: [id])

  @@id([condominiumId, policyId])
}

// ─── PARTNERS ─────────────────────────────────────────────────

model Partner {
  id          String      @id @default(cuid())
  tenantId    String
  userId      String      @unique
  creaNumber  String
  type        PartnerType
  specialties String[]
  cities      String[]
  states      String[]    // aceita "*" como wildcard para qualquer estado
  basePrice   Decimal
  rating      Decimal?
  slaHours    Int?
  active      Boolean     @default(true)
  createdAt   DateTime    @default(now())

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  user        User         @relation(fields: [userId], references: [id])
  cases       ReformCase[]
  inspections Inspection[]
}

enum PartnerType { ENGINEER ARCHITECT }

// ─── INSPECTIONS ──────────────────────────────────────────────

model Inspection {
  id          String           @id @default(cuid())
  caseId      String
  partnerId   String
  tenantId    String
  type        InspectionType
  scheduledAt DateTime?
  completedAt DateTime?
  status      InspectionStatus @default(SCHEDULED)
  notes       String?
  photoKeys   String[]
  reportId    String?
  extraCharge Decimal?

  case    ReformCase @relation(fields: [caseId], references: [id])
  partner Partner    @relation(fields: [partnerId], references: [id])
}

enum InspectionType   { INITIAL INTERMEDIATE FINAL EXTRA CRITICAL_SYSTEM }
enum InspectionStatus { SCHEDULED COMPLETED CANCELLED RESCHEDULED }

// ─── COMMERCIAL ───────────────────────────────────────────────

model CommercialPlan {
  id                   String  @id @default(cuid())
  tenantId             String
  name                 String
  description          String
  basePrice            Decimal
  extraInspectionPrice Decimal
  includes             Json
  active               Boolean @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id])
}

// ─── AUDIT ────────────────────────────────────────────────────

model AuditLog {
  id          String   @id @default(cuid())
  tenantId    String
  caseId      String?
  userId      String?
  action      String   // "case.status.changed" | "document.uploaded" | "ai.classification"
  triggeredBy String   // "user:{id}" | "system" | "ai"
  details     Json?
  aiReasoning Json?
  createdAt   DateTime @default(now())

  case ReformCase? @relation(fields: [caseId], references: [id])
  user User?       @relation(fields: [userId], references: [id])
}

// ─── NOTIFICATIONS ────────────────────────────────────────────

model Notification {
  id        String   @id @default(cuid())
  userId    String
  tenantId  String
  title     String
  body      String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, read])
}
```

---

## 9. CAMADA DE IA

### Regra fundamental

```
IA sugere → Rule Engine valida → CaseStateMachine executa
```

A IA nunca chama `stateMachine.transition()`. Ela retorna sugestão. O application service decide.

### Abstração LLM

```typescript
// document-intelligence/domain/LLMProvider.ts
interface LLMProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  stream(prompt: string, options?: CompletionOptions): AsyncIterable<string>
  completeWithTools(prompt: string, tools: LLMTool[], options?: CompletionOptions): Promise<CompletionResult>
  streamComplete(systemPrompt: string, messages: Array<{role: string; content: string}>, tools: LLMTool[], options?: CompletionOptions): AsyncIterable<string>
}
// AnthropicProvider.ts fica em infrastructure/llm/ — único lugar que importa o SDK
```

### Agentes (Application Services)

| Agente | Arquivo | Uso do LLM | Output validado por Zod |
|--------|---------|-----------|--------------------------|
| `TriageAgent` | case-intake/application | **tool-use nativo** (`submit_scope`) + SSE | `ReformScopeSchema` |
| `ClaudeDocumentAgent` | document-intelligence/application | `complete`, JSON em `<extraction>` | `DocumentExtractionResultSchema` |
| `ClaudeAnalysisAgent` | document-intelligence/application | `complete`, JSON em `<analysis>` | `DocumentAnalysisResultSchema` |
| `ClaudeReportAgent` | document-generation/application | `complete`, JSON em `<narrative>` | `NarrativeSchema` + `ReportContentSchema` |
| `CommercialAgent` | commercial-offers/application | `complete`, JSON em `<offer>` | `CommercialOfferOutputSchema` |

**Modelos:** configuráveis por env var, com defaults no código (decisão documentada — `claude-sonnet-4-20250514` foi aposentado pela Anthropic em 15/06/2026):

| Env var | Uso | Default |
|---------|-----|---------|
| `ANTHROPIC_MODEL` | Default geral (`AnthropicProvider`) | `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_EXTRACTION` | Extração de campos de documentos | `claude-haiku-4-5` |
| `ANTHROPIC_MODEL_ANALYSIS` | Análise cruzada de documentos | `claude-sonnet-4-6` |
| `ANTHROPIC_MODEL_PHOTOS` | Documentos `PHOTOS` (precisão extra) | = `ANTHROPIC_MODEL_ANALYSIS` |

O wiring por etapa fica no entrypoint do worker (`src/workers/document-worker.ts`); os agentes recebem o modelo via construtor e o repassam em `CompletionOptions.model`.

**Apenas `TriageAgent` usa tool-use real da API.** Os outros 4 usam JSON delimitado por tags com `safeParse` Zod. Em falha de parse, todos os agentes (exceto `ClaudeAnalysisAgent`) retornam fallback sem lançar exceção.

---

## 10. PIPELINE DOCUMENTAL

```
upload
  → validar mime type
  → salvar no storage (storageKey no banco)
  → enfileirar no BullMQ
    → worker: extrair texto (OCR)
    → worker: extrair dados estruturados (LLM)
    → worker: validar coerência (LLM + regras)
    → worker: atualizar status do Document
    → worker: verificar checklist do caso
    → worker: emitir evento ChecklistUpdated
      → application: recalcular status do caso
```

Cada etapa é idempotente. Em falha, o worker reprocessa.

---

## 11. STORAGE

```typescript
// infrastructure/storage/StorageAdapter.ts
interface StorageAdapter {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>
  delete(key: string): Promise<void>
}
```

**Estrutura de chaves:**
```
tenants/{tenantId}/condominiums/{condominiumId}/units/{unitId}/cases/{caseId}/
  incoming/{documentId}/{fileName}
  reports/{reportId}/{fileName}
  inspections/{inspectionId}/photos/{photoId}
  final/{documentId}/{fileName}
```

**Signed URLs expiram em 1 hora. Nenhuma URL permanente é exposta.**

---

## 12. APIs

**Convenções:** Prefixo `/api/v1/`. JWT obrigatório (exceto rotas marcadas como público). Auth via `requireSessionUser()` por rota — não há middleware global. Toda query ao banco filtra por `tenantId`.

```
# ── AUTH / SAÚDE / PÚBLICO ────────────────────────────────────────────────────
GET/POST  /api/auth/[...nextauth]                  # NextAuth handler (fora do /v1)
GET       /api/health                              # público — ping SELECT 1

POST      /api/v1/auth/register                    # público — autocadastro de morador (CLIENT)

GET       /api/v1/public/condominiums              # público — lista para tela de registro
GET       /api/v1/public/condominiums/:id          # público — detalhe para registro

# ── CASOS ─────────────────────────────────────────────────────────────────────
POST      /api/v1/cases                            # qualquer role autenticado
GET       /api/v1/cases                            # qualquer role; CLIENT vê só os próprios
GET       /api/v1/cases/:caseId                    # qualquer role (tenant-scoped)

POST      /api/v1/cases/:caseId/messages           # qualquer role (não-streaming)
GET       /api/v1/cases/:caseId/messages           # qualquer role
GET       /api/v1/cases/:caseId/messages/stream    # qualquer role — SSE (usado pela UI)

POST      /api/v1/cases/:caseId/documents          # qualquer role; upload via backend
GET       /api/v1/cases/:caseId/documents          # qualquer role
GET       /api/v1/cases/:caseId/documents/:id/url  # qualquer role — signed URL (1h)
POST      /api/v1/cases/:caseId/documents/analyze  # ADMIN | SUPER_ADMIN | CONDOMINIUM

POST      /api/v1/cases/:caseId/reports/generate   # qualquer role
GET       /api/v1/cases/:caseId/reports            # qualquer role
GET       /api/v1/cases/:caseId/reports/:id/url    # qualquer role — signed URL

POST      /api/v1/cases/:caseId/commercial/quote   # ADMIN | SUPER_ADMIN | CONDOMINIUM
POST      /api/v1/cases/:caseId/commercial/accept  # CLIENT | ADMIN | SUPER_ADMIN

GET       /api/v1/cases/:caseId/inspections        # qualquer role
POST      /api/v1/cases/:caseId/inspections        # PARTNER | ADMIN | SUPER_ADMIN
PATCH     /api/v1/cases/:caseId/inspections/:id    # qualquer role (reagendamento)
POST      /api/v1/cases/:caseId/inspections/:id/complete  # qualquer role

# ── PARCEIROS ─────────────────────────────────────────────────────────────────
GET       /api/v1/partners                         # ADMIN | SUPER_ADMIN | CONDOMINIUM
GET       /api/v1/partners/:partnerId/cases        # PARTNER — verifica posse (userId)
POST      /api/v1/partners/:partnerId/cases/:caseId/accept   # PARTNER — verifica posse
POST      /api/v1/partners/:partnerId/cases/:caseId/decline  # PARTNER — verifica posse

# ── ADMIN (ADMIN | SUPER_ADMIN) ───────────────────────────────────────────────
GET       /api/v1/admin/dashboard
GET       /api/v1/admin/review-queue
POST      /api/v1/admin/review/:caseId               # + PARTNER (revisor técnico — exige Partner ativo)

GET       /api/v1/admin/policies
POST      /api/v1/admin/policies                   # política global: só SUPER_ADMIN
PATCH     /api/v1/admin/policies/:id
DELETE    /api/v1/admin/policies/:id
PATCH     /api/v1/admin/policies/:id/rules

GET       /api/v1/admin/condominiums
POST      /api/v1/admin/condominiums
PATCH     /api/v1/admin/condominiums/:id
DELETE    /api/v1/admin/condominiums/:id
GET       /api/v1/admin/condominiums/:id/units
POST      /api/v1/admin/condominiums/:id/units
PATCH     /api/v1/admin/condominiums/:id/units/:id
DELETE    /api/v1/admin/condominiums/:id/units/:id

GET       /api/v1/admin/partners
POST      /api/v1/admin/partners                   # cria User + Partner
PATCH     /api/v1/admin/partners/:id
DELETE    /api/v1/admin/partners/:id

# ── SUPERADMIN (SUPER_ADMIN apenas) ───────────────────────────────────────────
GET       /api/v1/superadmin/tenants
POST      /api/v1/superadmin/tenants
PATCH     /api/v1/superadmin/tenants/:id           # toggle active

GET       /api/v1/superadmin/users
POST      /api/v1/superadmin/users
PATCH     /api/v1/superadmin/users/:id             # toggle active

GET       /api/v1/superadmin/report-skills         # lista configs de Agent Skills
PUT       /api/v1/superadmin/report-skills/:type   # upsert skill por ReportType
POST      /api/v1/superadmin/users/:id/anonymize   # LGPD: anonimiza usuário a pedido

# ── SÍNDICO / REVISÃO DE CASO ─────────────────────────────────────────────────
POST      /api/v1/cases/:caseId/syndic-review/approve   # CONDOMINIUM — aprova reforma
POST      /api/v1/cases/:caseId/syndic-review/reject    # CONDOMINIUM — recusa (reason)
GET       /api/v1/condominiums/:id/partner              # CONDOMINIUM (próprio) | ADMIN | MANAGER | SUPER_ADMIN — parceiro fixo
PUT       /api/v1/condominiums/:id/partner              # idem — define/remove ({ partnerId | null })
POST      /api/v1/cases/:caseId/assign-partner          # CONDOMINIUM (próprio) | ADMIN | MANAGER | SUPER_ADMIN — atribui (fixo > matcher)
GET       /api/v1/specialists                            # público — metadados dos specialists do chat

# ── LGPD / "EU" (usuário autenticado) ─────────────────────────────────────────
GET       /api/v1/me/pending-actions               # ações pendentes por papel
GET       /api/v1/me/data-export                   # LGPD: exporta dados do próprio titular (JSON)
POST      /api/v1/me/account/delete                # LGPD: anonimiza a própria conta ({ confirm: true })

# ── OBSERVABILIDADE ───────────────────────────────────────────────────────────
GET       /api/v1/admin/system-status              # ADMIN | SUPER_ADMIN — status de config + liveness
POST      /api/v1/monitoring/client-error          # público (rate-limit IP) — beacon de erro do cliente

# ── UTILITÁRIOS ───────────────────────────────────────────────────────────────
GET       /api/v1/units                            # lista units do tenant; CLIENT filtrado por ownerEmail
GET       /api/v1/notifications                    # notificações do usuário autenticado
PATCH     /api/v1/notifications/:id               # marcar lida (valida posse)
```

---

## 13. REGRAS DE NEGÓCIO CRÍTICAS

1. **ART/RRT nunca é emitida pela plataforma.**
2. **HIGH/CRITICAL nunca vão para `ELIGIBLE_FOR_RELEASE` sem `HUMAN_REVIEW_REQUIRED` antes.**
3. **Transição inválida lança exceção. Nunca silenciosa.**
4. **Toda decisão automática é logada em `AuditLog` com `aiReasoning`.**
5. **Impermeabilização exige vistoria antes de cobertura.** Não bypassável por config.
6. **Pacote comercial inclui mínimo 3 vistorias.** Extras são cobradas à parte.
7. **Upload sempre via backend.** Nunca direto ao storage pelo cliente.
8. **Signed URLs expiram em 1 hora.**
9. **Toda query ao banco tem `tenantId` como filtro obrigatório.**
10. **Todo relatório gerado por IA inclui disclaimer** de responsabilidade técnica.
11. **IA sugere → Rule Engine valida → StateMachine executa.** Essa ordem não é negociável.
12. **LGPD — eliminação é por anonimização, não hard delete.** Casos, documentos legais, ART/RRT e `AuditLog` são preservados, mas desvinculados de PII (`AnonymizeUserUseCase`). Exportação de dados do titular via `GET /api/v1/me/data-export`.
13. **Rotas custosas têm rate-limit por usuário** (chat/relatórios/análise/proposta/upload) via `enforceUserRateLimit` (Redis, fail-open). Auth/registro têm rate-limit por IP.

---

## 14. VARIÁVEIS DE AMBIENTE

```env
# Banco (dev: porta 5433 — docker-compose mapeia 5433:5432)
DATABASE_URL=postgresql://reformai:reformai_dev@localhost:5433/reformai

REDIS_URL=redis://localhost:6379
NEXTAUTH_SECRET=change-me-in-production
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=

# Modelos Claude por finalidade (opcionais — ver §9 para defaults)
# ANTHROPIC_MODEL=claude-sonnet-4-6
# ANTHROPIC_MODEL_EXTRACTION=claude-haiku-4-5
# ANTHROPIC_MODEL_ANALYSIS=claude-sonnet-4-6
# ANTHROPIC_MODEL_PHOTOS=

# Storage (minio | s3)
STORAGE_ADAPTER=minio
MINIO_ENDPOINT=localhost:9000
MINIO_PUBLIC_ENDPOINT=           # opcional: endpoint público para signed URLs (browser)
MINIO_ACCESS_KEY=reformai
MINIO_SECRET_KEY=reformai_dev
MINIO_BUCKET=reformai

# Alternativa S3 (quando STORAGE_ADAPTER=s3)
# AWS_REGION=
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_S3_BUCKET=

NEXT_PUBLIC_APP_URL=http://localhost:3000

# Monitoramento de erros (Sentry-compatível via DSN — Sentry SaaS ou GlitchTip
# self-hosted). Em branco = desativado (captureException vira no-op).
SENTRY_DSN=
# SENTRY_TRACES_SAMPLE_RATE=0
# APP_RELEASE=

# Seed demo (13 casos + usuários de teste). NÃO usar em produção.
SEED_DEMO=false
```

---

## 15. USUÁRIOS DE TESTE (seed)

Criados apenas com `SEED_DEMO=true`. Hash scrypt (não SHA-256).

| Email | Senha | Role |
|-------|-------|------|
| admin@demo.com | senha123 | SUPER_ADMIN |
| sindico@demo.com | senha123 | CONDOMINIUM |
| morador@demo.com | senha123 | CLIENT |
| parceiro@demo.com | senha123 | PARTNER |

O seed cria também: 1 tenant `demo`, 1 condomínio, 3 units, 1 partner, 1 CommercialPlan e **13 casos demo** cobrindo todo o ciclo de vida (`RF-DEMO-*`).

O `seedEssential()` (roda sempre, inclusive em produção) cria/atualiza a política global padrão (14 regras) e o `ReportSkill` de Memorial Descritivo.

---

## 16. COMANDOS

```bash
docker-compose up -d           # PostgreSQL (5433) + Redis + MinIO

bun run db:generate            # prisma generate (gera cliente em packages/database/generated/)
bun run db:migrate             # prisma migrate dev
SEED_DEMO=true bun run db:seed # seed essencial + dados demo
bun run db:seed                # só seed essencial (política global + ReportSkill)
bun run db:create-admin        # cria SUPER_ADMIN de produção via ADMIN_EMAIL/ADMIN_PASSWORD

bun run dev                    # Next.js dev server (turbo)
bun run test                   # Vitest (unit)
bun run test:e2e               # Playwright (E2E)

# Worker standalone (separado do Next.js):
bun run apps/web/src/workers/document-worker.ts
```

---

## 17. NOTAS PARA O CLAUDE CODE

- **Runtime: Bun 1.3.10.** Usar `bun` em todos os comandos. Nunca `npm`, `npx` ou `yarn`.
- **Regra de negócio fica em `domain/`.** Nunca em controller, route handler, componente ou prompt.
- **`CaseStateMachine` é entidade de domínio pura.** Toda transição de estado passa por ela — inclusive `CreateCaseUseCase`. Não é helper, não é enum solto.
- **`DeterministicEvaluator` não chama IA.** É puro, determinístico, testável.
- **`LLMProvider` é interface de domínio.** `AnthropicProvider` é infraestrutura. O domínio não conhece Anthropic.
- **Toda query ao banco filtra por `tenantId`.** Sem exceção.
- **Toda saída da IA é validada por Zod antes de ser usada.**
- **Autorização é por rota** (não há `middleware.ts` global). Padrão: `requireSessionUser()` + checagem de role via `Set` + `forbidden()` de `@/interfaces/http/respond`. Para rotas de parceiro: verificar posse via `prisma.partner.findUnique({ where: { userId: user.id } })`.
- **Passwords** usam hash scrypt (`scrypt$<saltHex>$<hashHex>`) — único formato suportado. O branch legado SHA-256 foi removido de `auth.ts` e `seed-utils.ts` após confirmar 0 hashes legados em dev e prod.
- **Autocadastro de morador** é público: `POST /api/v1/auth/register` → `RegisterClientUseCase`. QR code gerado em `/sindico/cadastro`.
- **Report Skills** (`ReportSkill` model): tipos `MEMORIAL_DESCRITIVO` e `CRONOGRAMA` são gerados via Anthropic Agent Skill configurável pelo SUPER_ADMIN em `/skills`.
- **Antes de implementar qualquer coisa: proponha, liste hipóteses, aguarde confirmação.**
