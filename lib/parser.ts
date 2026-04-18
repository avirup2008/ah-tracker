/**
 * AH Receipt Parser
 * Parses raw text extracted from Albert Heijn PDF receipts into structured data.
 *
 * Handles all observed edge cases:
 *   - Multi-qty lines: "2 LIEFMANS 1,43 2,86"
 *   - Single-qty lines: "1 AH HV MELK 1,85"
 *   - Bonus items: "1 AH LUNCHSAL 4,29 B"
 *   - Statiegeld: "+STATIEGELD 0,20"
 *   - Koopzegels: "42 KOOPZEGELS PREMIUM 4,20"
 *   - Bonus discount lines: "BONUS NESCAFE&STAR -2,00"
 *   - Multiple BTW rates: 9% (food) and 21% (non-food)
 */

export interface ParsedItem {
  rawName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  isBonusItem: boolean
  isStatiegeld: boolean
  isKoopzegel: boolean
}

export interface ParsedReceipt {
  storeId: string
  date: Date
  time: string | null
  items: ParsedItem[]
  subtotal: number
  bonusSavings: number
  koopzegels: number
  statiegeld: number
  totalPaid: number
  netGrocerySpend: number
  paymentMethod: string | null
  itemCount: number
  rawText: string
}

interface ParserState {
  items: ParsedItem[]
  bonusSavings: number
  koopzegels: number
  statiegeld: number
  totalPaid: number
  paymentMethod: string | null
  parsingItems: boolean
  pendingItemLine: string | null
}

const AMOUNT_RE = /^-?\d+,\d{2}$/

/** Convert Dutch decimal "1,85" → 1.85 */
function parseDutchAmount(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

function extractStoreId(lines: string[]): string {
  return lines[0]?.match(/^\d{4}$/) ? lines[0] : 'unknown'
}

function extractDateTime(lines: string[]): { date: Date; time: string | null } | null {
  for (const line of lines) {
    const dtMatch = line.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (!dtMatch) continue

    const [, hh, mm, dd, mo, yyyy] = dtMatch
    return {
      date: new Date(`${yyyy}-${mo.padStart(2, '0')}-${dd.padStart(2, '0')}`),
      time: `${hh.padStart(2, '0')}:${mm}:00`,
    }
  }

  return null
}

function extractTotalPaid(line: string, nextLine: string | undefined): number | null {
  if (line === 'TOTAAL' && nextLine && AMOUNT_RE.test(nextLine)) {
    return parseDutchAmount(nextLine)
  }

  const totaalMatch = line.match(/^TOTAAL\s+(\d+,\d{2})$/)
  return totaalMatch ? parseDutchAmount(totaalMatch[1]) : null
}

function extractPaymentMethod(line: string, current: string | null): string | null {
  if (line === 'PINNEN') return 'PIN'
  if (line.includes('CONTANT')) return 'Cash'
  if (line.includes('MAESTRO') && !current) return 'Maestro'
  return current
}

function extractKoopzegels(line: string): number | null {
  const koopMatch = line.match(/^\d+\s+KOOPZEGELS(?:\s+.+?)?\s+(\d+,\d{2})$/)
  return koopMatch ? parseDutchAmount(koopMatch[1]) : null
}

function extractBonusDiscount(line: string): number | null {
  if (!line.startsWith('BONUS ') || !line.match(/-\d+,\d{2}$/)) return null
  const bonusMatch = line.match(/(-\d+,\d{2})$/)
  return bonusMatch ? Math.abs(parseDutchAmount(bonusMatch[1])) : null
}

function extractVoordeelTotal(line: string): number | null {
  const voordeelMatch = line.match(/^UW VOORDEEL\s+(\d+,\d{2})$/)
  return voordeelMatch ? parseDutchAmount(voordeelMatch[1]) : null
}

function extractStatiegeld(line: string): number | null {
  if (!line.startsWith('+STATIEGELD')) return null
  const stMatch = line.match(/(\d+,\d{2})$/)
  return stMatch ? parseDutchAmount(stMatch[1]) : null
}

function parseItemLine(line: string): ParsedItem | null {
  const parts = line.split(/\s+/)
  if (parts.length < 3) return null

  const qtyStr = parts[0]
  if (!/^\d+$/.test(qtyStr)) return null
  const quantity = parseInt(qtyStr, 10)

  const lastToken = parts[parts.length - 1]
  const isBonusItem = lastToken === 'B'
  const valueParts = isBonusItem ? parts.slice(0, -1) : parts
  const last = valueParts[valueParts.length - 1]
  const secondLast = valueParts[valueParts.length - 2]

  if (!AMOUNT_RE.test(last)) return null

  let unitPrice: number
  let totalPrice: number
  let nameEnd: number

  if (AMOUNT_RE.test(secondLast)) {
    unitPrice = parseDutchAmount(secondLast)
    totalPrice = parseDutchAmount(last)
    nameEnd = valueParts.length - 2
  } else {
    unitPrice = parseDutchAmount(last)
    totalPrice = parseDutchAmount(last)
    nameEnd = valueParts.length - 1
  }

  const rawName = valueParts.slice(1, nameEnd).join(' ')
  if (!rawName) return null

  return {
    rawName,
    quantity,
    unitPrice,
    totalPrice,
    isBonusItem,
    isStatiegeld: rawName.includes('STATIEGELD'),
    isKoopzegel: false,
  }
}

function startsPotentialItem(line: string): boolean {
  return /^\d+\s+/.test(line)
}

function parseReceiptLines(lines: string[]): ParserState {
  const state: ParserState = {
    items: [],
    bonusSavings: 0,
    koopzegels: 0,
    statiegeld: 0,
    totalPaid: 0,
    paymentMethod: null,
    parsingItems: false,
    pendingItemLine: null,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.includes('BONUSKAART')) {
      state.parsingItems = true
      state.pendingItemLine = null
      continue
    }

    if (line.startsWith('SUBTOTAAL') || line.startsWith('UW VOORDEEL')) {
      state.parsingItems = false
      state.pendingItemLine = null
    }

    const totalPaid = extractTotalPaid(line, lines[i + 1])
    if (totalPaid !== null) state.totalPaid = totalPaid

    state.paymentMethod = extractPaymentMethod(line, state.paymentMethod)

    const koopzegels = extractKoopzegels(line)
    if (koopzegels !== null) {
      state.koopzegels = koopzegels
      continue
    }

    const bonusDiscount = extractBonusDiscount(line)
    if (bonusDiscount !== null) {
      state.bonusSavings += bonusDiscount
      continue
    }

    const voordeelTotal = extractVoordeelTotal(line)
    if (voordeelTotal !== null && state.bonusSavings === 0) {
      state.bonusSavings = voordeelTotal
    }

    const statiegeld = extractStatiegeld(line)
    if (statiegeld !== null) {
      state.statiegeld += statiegeld
      continue
    }

    if (!state.parsingItems) continue

    let item = parseItemLine(line)
    if (!item && state.pendingItemLine) {
      item = parseItemLine(`${state.pendingItemLine} ${line}`)
      if (item) state.pendingItemLine = null
    }

    if (!item && startsPotentialItem(line)) {
      state.pendingItemLine = line
      continue
    }

    if (!item) continue

    state.pendingItemLine = null
    if (item.isStatiegeld) state.statiegeld += item.totalPrice
    state.items.push(item)
  }

  return state
}

function buildParsedReceipt(
  storeId: string,
  dateTime: { date: Date; time: string | null },
  state: ParserState,
  rawText: string
): ParsedReceipt | null {
  const groceryItems = state.items.filter((item) => !item.isStatiegeld && !item.isKoopzegel)
  if (state.totalPaid <= 0 || groceryItems.length === 0) return null

  const subtotal = roundMoney(groceryItems.reduce((sum, item) => sum + item.totalPrice, 0))
  const netGrocerySpend = roundMoney(Math.max(0, state.totalPaid - state.koopzegels - state.statiegeld))

  return {
    storeId,
    date: dateTime.date,
    time: dateTime.time,
    items: state.items,
    subtotal,
    bonusSavings: roundMoney(state.bonusSavings),
    koopzegels: roundMoney(state.koopzegels),
    statiegeld: roundMoney(state.statiegeld),
    totalPaid: roundMoney(state.totalPaid),
    netGrocerySpend,
    paymentMethod: state.paymentMethod,
    itemCount: groceryItems.length,
    rawText,
  }
}

/** Derive the preceding Saturday for week grouping */
export function getWeekSaturday(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  const daysToSaturday = (dow + 1) % 7
  d.setDate(d.getDate() - daysToSaturday)
  return d
}

/**
 * Parse filename to extract date, time, store
 * Format: AH_kassabon_YYYY-MM-DD_HHMMSS_STOREID.pdf
 */
export function parseFilename(filename: string): {
  date: Date
  time: string
  storeId: string
} | null {
  const base = filename.replace(/\.pdf$/i, '')
  const match = base.match(/(\d{4}-\d{2}-\d{2})[_ ](\d{6})_(\d+)$/)
  if (!match) return null

  const [, dateStr, timeStr, storeId] = match
  return {
    date: new Date(`${dateStr}T00:00:00`),
    time: `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`,
    storeId,
  }
}

export function parseReceiptText(text: string, rawText: string): ParsedReceipt | null {
  const lines = normalizeLines(text)
  if (lines.length === 0) return null

  const storeId = extractStoreId(lines)
  const dateTime = extractDateTime(lines)
  if (!dateTime) return null

  const state = parseReceiptLines(lines)
  return buildParsedReceipt(storeId, dateTime, state, rawText)
}
