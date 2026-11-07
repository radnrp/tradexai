// A Persian or Arabic keyboard types its own digits, and \d only knows ASCII. Inputs turn them into ASCII before anything reads them.

/** Persian and Arabic digits and separators to ASCII; everything else is left as it is. */
export function normalizeDigits(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/** A one-time code as typed so far: ASCII digits, at most six. */
export const otpInput = (raw: string) => normalizeDigits(raw).replace(/\D/g, "").slice(0, 6);
