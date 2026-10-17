/**
 * Return the first well-formed product barcode among a detector's candidates.
 * Preserve leading zeroes (UPC/EAN); never silently strip invalid characters.
 * This is a format check, not an EAN/UPC checksum or catalog verification.
 */
export function firstProductBarcode(codes) {
  if (!Array.isArray(codes)) return ''
  for (const candidate of codes) {
    const value = String(candidate?.rawValue ?? '').trim()
    if (/^\d{7,14}$/.test(value)) return value
  }
  return ''
}
