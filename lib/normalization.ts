const OWN_BRAND_PREFIXES = ['AH ', 'ALBERT HEIJN ', 'AH.']

const RAW_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bHV\b/g, 'HALFVOLLE'],
  [/\bVOL\b/g, 'VOLLE'],
  [/\bBIO\b/g, 'BIOLOGISCH'],
  [/\bORG\b/g, 'ORGANIC'],
]

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function removeTranslationSuffix(value: string): string {
  return value.replace(/\s+\([^)]*\)\s*$/u, '').trim()
}

function normalizePrefix(value: string): string {
  if (/^ALBERT HEIJN\s+/u.test(value)) return value.replace(/^ALBERT HEIJN\s+/u, 'AH ')
  if (/^AH\.\s*/u.test(value)) return value.replace(/^AH\.\s*/u, 'AH ')
  return value
}

function normalizeCoreName(value: string, expandAbbreviations: boolean): string {
  let normalized = value
    .normalize('NFKC')
    .replace(/[./:_-]+/g, ' ')
    .replace(/[(),]+/g, ' ')
    .toUpperCase()

  normalized = normalizePrefix(normalized)

  if (expandAbbreviations) {
    for (const [pattern, replacement] of RAW_ABBREVIATIONS) {
      normalized = normalized.replace(pattern, replacement)
    }
  }

  return collapseWhitespace(normalized)
}

function getBaseName(rawName: string, cleanName?: string | null): string {
  const clean = cleanName ? removeTranslationSuffix(cleanName) : ''
  return clean || rawName
}

export function detectOwnBrand(rawName: string, cleanName?: string | null): boolean {
  const candidates = [
    rawName.trim().toUpperCase(),
    cleanName?.trim().toUpperCase() ?? '',
  ]

  return candidates.some((value) =>
    OWN_BRAND_PREFIXES.some((prefix) => value.startsWith(prefix))
  )
}

export function normalizeItemName(rawName: string, cleanName?: string | null): string {
  const baseName = getBaseName(rawName, cleanName)
  const normalized = normalizeCoreName(baseName, !cleanName)
  return normalizePrefix(normalized)
}

export function buildNormalizedItemFields(rawName: string, cleanName?: string | null) {
  return {
    normalizedName: normalizeItemName(rawName, cleanName),
    isOwnBrand: detectOwnBrand(rawName, cleanName),
  }
}
