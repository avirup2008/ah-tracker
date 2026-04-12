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
  netGrocerySpend: number  // totalPaid - koopzegels - statiegeld
  paymentMethod: string | null
  itemCount: number
  rawText: string
}

/** Convert Dutch decimal "1,85" → 1.85 */
function parseDutchAmount(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

/** Derive the preceding Saturday for week grouping */
export function getWeekSaturday(date: Date): Date {
  const d = new Date(date)
  // DOW: 0=Sun, 6=Sat
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
  // Try: AH_kassabon_2025-11-14_184400_1251
  const m = base.match(/(\d{4}-\d{2}-\d{2})[_ ](\d{6})_(\d+)$/)
  if (!m) return null
  const [, dateStr, timeStr, storeId] = m
  const date = new Date(dateStr + 'T00:00:00')
  const time = `${timeStr.slice(0,2)}:${timeStr.slice(2,4)}:${timeStr.slice(4,6)}`
  return { date, time, storeId }
}

export function parseReceiptText(text: string, rawText: string): ParsedReceipt | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Extract store ID (first line is usually the store number)
  const storeId = lines[0]?.match(/^\d{4}$/) ? lines[0] : 'unknown'

  // ── Extract date and time (near bottom: "18:44 14-11-2025")
  let date = new Date()
  let time: string | null = null
  for (const line of lines) {
    const dtMatch = line.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (dtMatch) {
      const [, hh, mm, dd, mo, yyyy] = dtMatch
      date = new Date(`${yyyy}-${mo.padStart(2,'0')}-${dd.padStart(2,'0')}`)
      time = `${hh.padStart(2,'0')}:${mm}:00`
      break
    }
  }

  // ── Parse item lines
  const items: ParsedItem[] = []
  let bonusSavings = 0
  let koopzegels = 0
  let statiegeld = 0
  let totalPaid = 0
  let paymentMethod: string | null = null
  let parsingItems = false

  // Amount regex: Dutch format e.g. "1,85" or "-2,00"
  const amtRe = /^-?\d+,\d{2}$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Start parsing after BONUSKAART line
    if (line.includes('BONUSKAART')) {
      parsingItems = true
      continue
    }

    // Stop at SUBTOTAAL / UW VOORDEEL section
    if (line.startsWith('SUBTOTAAL') || line.startsWith('UW VOORDEEL')) {
      parsingItems = false
    }

    // Extract TOTAAL
    if (line === 'TOTAAL') {
      const nextLine = lines[i + 1]
      if (nextLine && amtRe.test(nextLine)) {
        totalPaid = parseDutchAmount(nextLine)
      }
    }

    // Match "TOTAAL X,XX" on same line
    const totaalMatch = line.match(/^TOTAAL\s+(\d+,\d{2})$/)
    if (totaalMatch) totalPaid = parseDutchAmount(totaalMatch[1])

    // Payment method
    if (line === 'PINNEN') paymentMethod = 'PIN'
    if (line.includes('CONTANT')) paymentMethod = 'Cash'
    if (line.includes('MAESTRO') && !paymentMethod) paymentMethod = 'Maestro'

    // Koopzegels: "42 KOOPZEGELS PREMIUM 4,20"
    const koopMatch = line.match(/^(\d+)\s+KOOPZEGELS\s+\w+\s+(\d+,\d{2})$/)
    if (koopMatch) {
      koopzegels = parseDutchAmount(koopMatch[2])
      continue
    }

    // Bonus discount lines: "BONUS NESCAFE&STAR -2,00"
    if (line.startsWith('BONUS ') && line.match(/-\d+,\d{2}$/)) {
      const bonusMatch = line.match(/(-\d+,\d{2})$/)
      if (bonusMatch) bonusSavings += Math.abs(parseDutchAmount(bonusMatch[1]))
      continue
    }

    // UW VOORDEEL total (cross-check)
    const voordeelMatch = line.match(/^UW VOORDEEL\s+(\d+,\d{2})$/)
    if (voordeelMatch) {
      // Use this as authoritative bonus savings if we didn't sum from lines
      if (bonusSavings === 0) bonusSavings = parseDutchAmount(voordeelMatch[1])
    }

    // Statiegeld line: "+STATIEGELD 0,20"
    if (line.startsWith('+STATIEGELD')) {
      const stMatch = line.match(/(\d+,\d{2})$/)
      if (stMatch) statiegeld += parseDutchAmount(stMatch[0])
      continue
    }

    if (!parsingItems) continue

    // ── Item line parsing ──────────────────────────────────────────
    // Patterns:
    //   "1 AH HV MELK 1,85"          → qty name price
    //   "1 AH LUNCHSAL 4,29 B"        → qty name price B
    //   "2 LIEFMANS 1,43 2,86"        → qty name unitprice totalprice
    //   "2 LIEFMANS 1,43 2,86 B"      → qty name unitprice totalprice B

    const parts = line.split(/\s+/)
    if (parts.length < 3) continue

    // First token must be a quantity integer
    const qtyStr = parts[0]
    if (!/^\d+$/.test(qtyStr)) continue
    const qty = parseInt(qtyStr, 10)

    // Last token may be "B" (bonus flag)
    const lastToken = parts[parts.length - 1]
    const isBonusItem = lastToken === 'B'
    const valueParts = isBonusItem ? parts.slice(0, -1) : parts

    // Last 1 or 2 tokens are amounts
    const last = valueParts[valueParts.length - 1]
    const secondLast = valueParts[valueParts.length - 2]

    if (!amtRe.test(last)) continue // not a price line

    let unitPrice: number
    let totalPrice: number
    let nameEnd: number

    if (amtRe.test(secondLast)) {
      // Pattern: qty name unit total [B]
      unitPrice  = parseDutchAmount(secondLast)
      totalPrice = parseDutchAmount(last)
      nameEnd    = valueParts.length - 2
    } else {
      // Pattern: qty name price [B]
      unitPrice  = parseDutchAmount(last)
      totalPrice = parseDutchAmount(last)
      nameEnd    = valueParts.length - 1
    }

    const rawName = valueParts.slice(1, nameEnd).join(' ')
    if (!rawName) continue

    // Statiegeld can appear as an item too
    const isStatiegeld = rawName.includes('STATIEGELD')
    if (isStatiegeld) {
      statiegeld += totalPrice
    }

    items.push({
      rawName,
      quantity: qty,
      unitPrice,
      totalPrice,
      isBonusItem,
      isStatiegeld,
      isKoopzegel: false,
    })
  }

  // ── Net grocery spend
  const netGrocerySpend = Math.max(0, totalPaid - koopzegels - statiegeld)

  return {
    storeId,
    date,
    time,
    items,
    subtotal: items
      .filter(i => !i.isStatiegeld && !i.isKoopzegel)
      .reduce((sum, i) => sum + i.totalPrice, 0),
    bonusSavings,
    koopzegels,
    statiegeld,
    totalPaid,
    netGrocerySpend,
    paymentMethod,
    itemCount: items.filter(i => !i.isStatiegeld).length,
    rawText,
  }
}
