import PDFDocument from "pdfkit"

/**
 * Converte o markdown dos relatórios em um PDF A4 com a identidade visual
 * "Concreto Verde": capa com faixa institucional, seções com barra de acento,
 * tabelas reais (com pill de risco), listas aninhadas, bolhas de conversa na
 * triagem, caixa de disclaimer e rodapé com paginação.
 *
 * Sem browser headless — usa pdfkit com as fontes padrão (Helvetica).
 */

// ─── Paleta (tokens do design system em apps/web/app/globals.css) ────────────

const C = {
  green950: "#0A1812",
  green900: "#0F2419",
  green700: "#1F4A37",
  green600: "#2A6249",
  green500: "#3A8163",
  green300: "#9FC9B3",
  green100: "#E5F0EA",
  green50: "#F2F8F4",
  bone50: "#FBF8F1",
  bone100: "#F5F0E4",
  bone200: "#EBE4D0",
  bone300: "#D8CFB5",
  ink900: "#14130D",
  ink700: "#2A271C",
  ink600: "#3E3A2D",
  ink500: "#5C5742",
  ink400: "#7E7860",
  ink300: "#A5A089",
  ink200: "#C9C5B0",
  clay600: "#B0532A",
  clay500: "#C96A3D",
  ochre600: "#A77E1F",
  white: "#FFFFFF",
} as const

const RISK_META: Record<string, { label: string; bg: string }> = {
  LOW: { label: "Baixo", bg: C.green600 },
  MEDIUM: { label: "Médio", bg: C.ochre600 },
  HIGH: { label: "Alto", bg: C.clay500 },
  CRITICAL: { label: "Crítico", bg: C.clay600 },
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const PAGE = { margin: 52, footer: 46 }
const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
} as const

type Doc = PDFKit.PDFDocument

function contentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function bottomLimit(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom
}

/** Garante `needed` pontos de espaço vertical; senão, quebra a página. */
function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > bottomLimit(doc)) doc.addPage()
}

// ─── Inline (negrito/itálico/código) ─────────────────────────────────────────

interface Segment {
  text: string
  bold: boolean
}

function parseInline(text: string): Segment[] {
  return text
    .split(/(\*\*.+?\*\*)/g)
    .filter((s) => s.length > 0)
    .map((s) => {
      const bold = s.startsWith("**") && s.endsWith("**") && s.length > 4
      return { text: (bold ? s.slice(2, -2) : s).replace(/`/g, ""), bold }
    })
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
}

/** Parágrafo com segmentos em negrito intercalados, com indent e largura. */
function richText(
  doc: Doc,
  text: string,
  opts: { indent?: number; size?: number; color?: string; lineGap?: number } = {},
): void {
  const segments = parseInline(text)
  const x = doc.page.margins.left + (opts.indent ?? 0)
  const width = contentWidth(doc) - (opts.indent ?? 0)
  const size = opts.size ?? 9.5
  const lineGap = opts.lineGap ?? 2.6

  doc.fontSize(size).fillColor(opts.color ?? C.ink700)
  segments.forEach((seg, i) => {
    doc.font(seg.bold ? FONT.bold : FONT.regular)
    if (i === 0) {
      doc.text(seg.text, x, doc.y, { width, lineGap, continued: segments.length > 1 })
    } else {
      doc.text(seg.text, { width, lineGap, continued: i < segments.length - 1 })
    }
  })
  doc.x = doc.page.margins.left
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

/** Faixa institucional da capa com marca + título do documento. */
function renderCover(doc: Doc, title: string): void {
  const bandH = 118
  doc.save()
  doc.rect(0, 0, doc.page.width, bandH).fill(C.green950)
  // linha de acento na base da faixa
  doc.rect(0, bandH - 3, doc.page.width, 3).fill(C.green500)

  const x = doc.page.margins.left
  doc
    .font(FONT.bold)
    .fontSize(9)
    .fillColor(C.green300)
    .text("R E F O R M A I", x, 30, { characterSpacing: 1.5 })
  doc
    .font(FONT.regular)
    .fontSize(7.5)
    .fillColor(C.bone300)
    .text("PLATAFORMA TÉCNICO-OPERACIONAL DE REFORMAS", x, 44, { characterSpacing: 0.8 })
  doc
    .font(FONT.bold)
    .fontSize(21)
    .fillColor(C.white)
    .text(title, x, 68, { width: contentWidth(doc) })
  doc.restore()

  doc.x = doc.page.margins.left
  doc.y = bandH + 26
}

/** Grade de metadados (Protocolo, Data…) logo abaixo da capa. */
function renderMeta(doc: Doc, pairs: Array<{ label: string; value: string }>): void {
  const x = doc.page.margins.left
  const colW = contentWidth(doc) / Math.min(pairs.length, 3)
  const startY = doc.y

  pairs.slice(0, 3).forEach((p, i) => {
    const cx = x + i * colW
    doc
      .font(FONT.bold)
      .fontSize(6.8)
      .fillColor(C.ink400)
      .text(p.label.toUpperCase(), cx, startY, { characterSpacing: 0.9, width: colW - 12 })
    doc
      .font(FONT.bold)
      .fontSize(11)
      .fillColor(C.ink900)
      .text(stripInline(p.value), cx, startY + 11, { width: colW - 12 })
  })

  doc.x = x
  doc.y = startY + 34
  doc
    .moveTo(x, doc.y)
    .lineTo(x + contentWidth(doc), doc.y)
    .lineWidth(0.7)
    .strokeColor(C.bone300)
    .stroke()
  doc.y += 18
}

/** Cabeçalho de seção (##) com barra de acento. */
function renderH2(doc: Doc, text: string): void {
  ensureSpace(doc, 64)
  doc.y += 10
  const x = doc.page.margins.left
  const y = doc.y
  doc.rect(x, y + 1, 3.5, 12).fill(C.green600)
  doc
    .font(FONT.bold)
    .fontSize(12.5)
    .fillColor(C.green900)
    .text(stripInline(text), x + 11, y, { width: contentWidth(doc) - 11 })
  doc.x = x
  const ruleY = doc.y + 4
  doc
    .moveTo(x, ruleY)
    .lineTo(x + contentWidth(doc), ruleY)
    .lineWidth(0.5)
    .strokeColor(C.bone200)
    .stroke()
  doc.y = ruleY + 10
}

/** Subtítulo (###) — usado nos cartões de documento. */
function renderH3(doc: Doc, text: string): void {
  ensureSpace(doc, 44)
  doc.y += 6
  const x = doc.page.margins.left
  const y = doc.y
  doc.rect(x, y + 2.5, 5, 5).fill(C.green500)
  doc
    .font(FONT.bold)
    .fontSize(10.5)
    .fillColor(C.ink900)
    .text(stripInline(text), x + 11, y, { width: contentWidth(doc) - 11 })
  doc.x = x
  doc.y += 4
}

function renderBullet(doc: Doc, text: string, level: number): void {
  ensureSpace(doc, 24)
  const indent = 10 + level * 14
  const x = doc.page.margins.left + indent
  const glyphY = doc.y + 3.2
  if (level === 0) {
    doc.circle(x - 7, glyphY + 1.6, 1.7).fill(C.green600)
  } else {
    doc.circle(x - 7, glyphY + 1.6, 1.4).lineWidth(0.8).strokeColor(C.ink300).stroke()
  }
  richText(doc, text, { indent, color: level === 0 ? C.ink700 : C.ink600 })
  doc.y += 2.5
}

/** Item de lista numerada (1., 2., …) com o número em destaque. */
function renderNumberedItem(doc: Doc, num: string, text: string): void {
  ensureSpace(doc, 24)
  const indent = 22
  const x = doc.page.margins.left
  const yStart = doc.y
  doc
    .font(FONT.bold)
    .fontSize(9.5)
    .fillColor(C.green700)
    .text(`${num}.`, x + 4, yStart, { lineBreak: false })
  doc.y = yStart
  richText(doc, text, { indent })
  doc.y += 2.5
}

/** Bolha de conversa do anexo de triagem. */
function renderChatBubble(doc: Doc, speaker: string, timestamp: string, text: string): void {
  const isResident = speaker === "Morador"
  const pad = 9
  const w = contentWidth(doc) * 0.86
  const x = isResident
    ? doc.page.margins.left
    : doc.page.margins.left + (contentWidth(doc) - w)

  doc.font(FONT.regular).fontSize(9)
  const body = stripInline(text)
  const textH = doc.heightOfString(body, { width: w - pad * 2, lineGap: 2.2 })
  const boxH = textH + pad * 2
  ensureSpace(doc, boxH + 26)

  // Cabeçalho da bolha: quem falou + quando
  doc
    .font(FONT.bold)
    .fontSize(7.8)
    .fillColor(isResident ? C.green700 : C.ink500)
    .text(speaker.toUpperCase(), x + 1, doc.y, { characterSpacing: 0.7, continued: true })
    .font(FONT.regular)
    .fillColor(C.ink300)
    .text(timestamp ? `   ${timestamp}` : "")
  doc.x = doc.page.margins.left
  doc.y += 3

  const boxY = doc.y
  doc
    .roundedRect(x, boxY, w, boxH, 5)
    .fill(isResident ? C.green50 : C.bone100)
  doc
    .font(FONT.regular)
    .fontSize(9)
    .fillColor(C.ink700)
    .text(body, x + pad, boxY + pad, { width: w - pad * 2, lineGap: 2.2 })

  doc.x = doc.page.margins.left
  doc.y = boxY + boxH + 9
}

/** Caixa de observação/disclaimer em itálico. */
function renderNoteBox(doc: Doc, text: string): void {
  const pad = 10
  const w = contentWidth(doc)
  const x = doc.page.margins.left

  doc.font(FONT.italic).fontSize(8.2)
  const body = stripInline(text)
  const textH = doc.heightOfString(body, { width: w - pad * 2 - 4, lineGap: 2 })
  const boxH = textH + pad * 2
  ensureSpace(doc, boxH + 10)

  const y = doc.y
  doc.rect(x, y, w, boxH).fill(C.bone100)
  doc.rect(x, y, 3, boxH).fill(C.bone300)
  doc
    .font(FONT.italic)
    .fontSize(8.2)
    .fillColor(C.ink500)
    .text(body, x + pad + 4, y + pad, { width: w - pad * 2 - 4, lineGap: 2 })

  doc.x = x
  doc.y = y + boxH + 12
}

// ─── Tabelas ─────────────────────────────────────────────────────────────────

interface Table {
  header: string[]
  rows: string[][]
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
}

function isTableSeparator(line: string): boolean {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-")
}

/** Pill colorida para células de nível de risco. */
function drawRiskPill(doc: Doc, value: string, x: number, y: number): void {
  const meta = RISK_META[value]!
  const label = meta.label.toUpperCase()
  doc.font(FONT.bold).fontSize(7.6)
  const tw = doc.widthOfString(label, { characterSpacing: 0.6 })
  const pw = tw + 16
  const ph = 14
  doc.roundedRect(x, y - 1.5, pw, ph, 7).fill(meta.bg)
  doc
    .fillColor(C.white)
    .text(label, x + 8, y + 1.6, { characterSpacing: 0.6, lineBreak: false })
}

function renderTable(doc: Doc, table: Table): void {
  const x0 = doc.page.margins.left
  const w = contentWidth(doc)
  const pad = 7
  const cols = table.header.length

  // Larguras: naturais (limitadas), esticando a última coluna para preencher
  doc.font(FONT.bold).fontSize(8.6)
  const natural = table.header.map((h, i) => {
    let max = doc.widthOfString(stripInline(h))
    doc.font(FONT.regular).fontSize(9)
    for (const row of table.rows) {
      max = Math.max(max, doc.widthOfString(stripInline(row[i] ?? "")))
    }
    doc.font(FONT.bold).fontSize(8.6)
    return Math.min(max + pad * 2 + 4, w * 0.6)
  })
  const sum = natural.reduce((a, b) => a + b, 0)
  const widths =
    sum > w
      ? natural.map((n) => (n / sum) * w)
      : natural.map((n, i) => (i === cols - 1 ? n + (w - sum) : n))

  const drawHeaderRow = () => {
    const h = 20
    ensureSpace(doc, h + 30)
    const y = doc.y
    doc.rect(x0, y, w, h).fill(C.green900)
    let cx = x0
    doc.font(FONT.bold).fontSize(8).fillColor(C.bone50)
    table.header.forEach((cell, i) => {
      doc.text(stripInline(cell).toUpperCase(), cx + pad, y + 6.5, {
        width: widths[i]! - pad * 2,
        characterSpacing: 0.5,
        lineBreak: false,
      })
      cx += widths[i]!
    })
    doc.x = x0
    doc.y = y + h
  }

  drawHeaderRow()

  table.rows.forEach((row, r) => {
    doc.font(FONT.regular).fontSize(9)
    const cellHeights = row.map((cell, i) =>
      doc.heightOfString(stripInline(cell), { width: widths[i]! - pad * 2, lineGap: 1.5 }),
    )
    const rowH = Math.max(...cellHeights, 10) + pad * 2 - 2

    if (doc.y + rowH > bottomLimit(doc)) {
      doc.addPage()
      drawHeaderRow()
    }

    const y = doc.y
    if (r % 2 === 1) doc.rect(x0, y, w, rowH).fill(C.bone50)

    let cx = x0
    row.forEach((cell, i) => {
      const plain = stripInline(cell)
      if (RISK_META[plain]) {
        drawRiskPill(doc, plain, cx + pad, y + (rowH - 12) / 2)
      } else {
        const boldCell = /^\*\*.*\*\*$/.test(cell.trim())
        doc
          .font(boldCell ? FONT.bold : FONT.regular)
          .fontSize(9)
          .fillColor(boldCell ? C.ink900 : C.ink700)
          .text(plain, cx + pad, y + pad - 1.5, { width: widths[i]! - pad * 2, lineGap: 1.5 })
      }
      cx += widths[i]!
    })

    // hairline entre linhas
    doc
      .moveTo(x0, y + rowH)
      .lineTo(x0 + w, y + rowH)
      .lineWidth(0.5)
      .strokeColor(C.bone200)
      .stroke()

    doc.x = x0
    doc.y = y + rowH
  })

  // moldura externa sutil
  doc.y += 14
}

// ─── Rodapé ──────────────────────────────────────────────────────────────────

function stampFooters(doc: Doc, title: string): void {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Zera a margem inferior enquanto escreve o rodapé — sem isto o pdfkit
    // interpreta o texto abaixo da margem como overflow e cria páginas extras.
    const oldBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    const y = doc.page.height - 34
    const x = doc.page.margins.left
    const w = contentWidth(doc)
    doc
      .moveTo(x, y - 7)
      .lineTo(x + w, y - 7)
      .lineWidth(0.5)
      .strokeColor(C.bone300)
      .stroke()
    doc
      .font(FONT.regular)
      .fontSize(7)
      .fillColor(C.ink400)
      .text(`ReformAI  ·  ${title}`, x, y, { lineBreak: false })
    const pageLabel = `Página ${i - range.start + 1} de ${range.count}`
    doc.text(pageLabel, x, y, { width: w, align: "right", lineBreak: false })

    doc.page.margins.bottom = oldBottom
  }
}

// ─── Conversão principal ─────────────────────────────────────────────────────

const CHAT_LINE = /^\*\*(Morador|Assistente)\*\*\s*\(([^)]*)\):\s*([\s\S]*)$/
const META_LINE = /^\*\*([^*]+):\*\*\s*(.+)$/

export function markdownToPdf(markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n")

    // Título do documento = primeiro H1 (fica na capa e no rodapé)
    const h1 = lines.find((l) => /^#\s+/.test(l))
    const title = h1 ? stripInline(h1.replace(/^#\s+/, "")) : "Relatório"

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: PAGE.margin, left: PAGE.margin, right: PAGE.margin, bottom: PAGE.footer + 18 },
      bufferPages: true,
      info: { Title: title, Author: "ReformAI" },
    })
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    try {
      let coverDrawn = false
      let metaPairs: Array<{ label: string; value: string }> | null = null
      let i = 0

      while (i < lines.length) {
        const raw = lines[i]!
        const line = raw.trimEnd()
        const trimmed = line.trim()

        // vazio
        if (trimmed === "") {
          doc.moveDown(0.4)
          i++
          continue
        }

        // H1 → capa
        const h1m = /^#\s+(.*)$/.exec(trimmed)
        if (h1m) {
          if (!coverDrawn) {
            renderCover(doc, stripInline(h1m[1]!))
            coverDrawn = true
            metaPairs = []
          } else {
            renderH2(doc, h1m[1]!)
          }
          i++
          continue
        }

        // Metadados logo após a capa (**Protocolo:** X)
        if (metaPairs !== null) {
          const mm = META_LINE.exec(trimmed)
          if (mm) {
            metaPairs.push({ label: mm[1]!, value: mm[2]! })
            i++
            continue
          }
          if (metaPairs.length > 0) renderMeta(doc, metaPairs)
          metaPairs = null
          continue
        }

        // H2 / H3
        const h2m = /^##\s+(.*)$/.exec(trimmed)
        if (h2m) {
          renderH2(doc, h2m[1]!)
          i++
          continue
        }
        const h3m = /^###\s+(.*)$/.exec(trimmed)
        if (h3m) {
          renderH3(doc, h3m[1]!)
          i++
          continue
        }

        // Régua horizontal — a última antecede o disclaimer; renderiza espaçamento
        if (/^---+$/.test(trimmed)) {
          doc.moveDown(0.6)
          i++
          continue
        }

        // Tabela
        if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
          const header = parseTableCells(trimmed)
          const rows: string[][] = []
          let j = i + 2
          while (j < lines.length && lines[j]!.trim().startsWith("|")) {
            rows.push(parseTableCells(lines[j]!))
            j++
          }
          renderTable(doc, { header, rows })
          i = j
          continue
        }

        // Bolha de conversa (anexo de triagem)
        const chat = CHAT_LINE.exec(trimmed)
        if (chat) {
          renderChatBubble(doc, chat[1]!, chat[2]!, chat[3]!)
          i++
          continue
        }

        // Lista (com aninhamento por indentação)
        const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
        if (bullet) {
          const level = Math.min(Math.floor(bullet[1]!.length / 2), 2)
          renderBullet(doc, bullet[2]!, level)
          i++
          continue
        }

        // Lista numerada (1. / 2) …)
        const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed)
        if (ordered) {
          renderNumberedItem(doc, ordered[1]!, ordered[2]!)
          i++
          continue
        }

        // Bloco em itálico (disclaimer / observações)
        if (/^\*[^*].*\*$/.test(trimmed) || /^_[^_].*_$/.test(trimmed)) {
          renderNoteBox(doc, trimmed.replace(/^[*_]|[*_]$/g, ""))
          i++
          continue
        }

        // Parágrafo comum — junta linhas consecutivas (semântica markdown)
        const parts = [trimmed]
        let k = i + 1
        while (k < lines.length) {
          const next = lines[k]!.trim()
          if (
            next === "" ||
            /^#{1,3}\s/.test(next) ||
            /^---+$/.test(next) ||
            next.startsWith("|") ||
            /^[-*]\s/.test(next) ||
            /^\d+[.)]\s/.test(next) ||
            CHAT_LINE.test(next) ||
            /^\*[^*].*\*$/.test(next)
          ) {
            break
          }
          parts.push(next)
          k++
        }
        ensureSpace(doc, 26)
        richText(doc, parts.join(" "))
        doc.y += 3
        i = k
      }

      // Markdown sem H1/conteúdo: garante capa mínima
      if (!coverDrawn) renderCover(doc, title)
      if (metaPairs && metaPairs.length > 0) renderMeta(doc, metaPairs)

      stampFooters(doc, title)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
