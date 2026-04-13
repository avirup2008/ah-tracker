import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEuro(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return `€${amount.toFixed(2).replace('.', ',')}`
}

export function formatDate(dateStr: string | Date | null | undefined, fmt = 'd MMM yyyy'): string {
  if (!dateStr) return '—'
  try {
    const date = dateStr instanceof Date ? dateStr : parseISO(String(dateStr).slice(0, 10))
    return format(date, fmt, { locale: nl })
  } catch {
    return String(dateStr).slice(0, 10)
  }
}

export function formatDateNL(dateStr: string): string {
  return formatDate(dateStr, 'EEEE d MMMM')
}

export function getMonthName(month: number): string {
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ]
  return months[month - 1] ?? ''
}

export function getCurrentWeekSaturday(): Date {
  const today = new Date()
  const dow = today.getDay() // 0=Sun, 6=Sat
  const daysToSaturday = (dow + 1) % 7
  const sat = new Date(today)
  sat.setDate(today.getDate() - daysToSaturday)
  return sat
}

export function formatWeekRange(saturday: string): string {
  const sat = parseISO(saturday)
  const fri = new Date(sat)
  fri.setDate(sat.getDate() + 6)
  return `${format(sat, 'd MMM', { locale: nl })} – ${format(fri, 'd MMM yyyy', { locale: nl })}`
}

export const STORE_NAMES: Record<string, string> = {
  '1251': 'Beverhof, Beverwijk',
  '5805': 'AH to go',
}

export function getStoreName(storeId: string | null): string {
  if (!storeId) return 'Unknown store'
  return STORE_NAMES[storeId] ?? 'Unknown AH location'
}

export const CATEGORY_ICONS: Record<string, string> = {
  'Vlees & Vis': '🥩',
  'Zuivel & Eieren': '🥛',
  'Groente & Fruit': '🥦',
  'Brood & Bakkerij': '🍞',
  'Pasta, Rijst & Granen': '🍚',
  'Sauzen & Kruiden': '🫙',
  'Maaltijden kant-en-klaar': '🍱',
  'Snacks & Zoetwaren': '🍿',
  'Dranken': '☕',
  'Bier & Wijn': '🍷',
  'Huishoud': '🧹',
  'Persoonlijke verzorging': '🪥',
  'Overig non-food': '📦',
}
