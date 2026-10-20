// Exact decimal helpers. Server amounts are strings; never run money math through Number.

const DECIMAL = /^-?\d+(\.\d+)?$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);

/** Keep digits and the first dot ("1,250.5 " → "1250.5"). */
export function normalizeAmountInput(raw: string): string {
  const ascii = raw.replace(/[^\d.]/g, "");
  const dot = ascii.indexOf(".");
  return dot === -1 ? ascii : ascii.slice(0, dot + 1) + ascii.slice(dot + 1).replace(/\./g, "");
}

export function isDecimal(v: string): boolean {
  return DECIMAL.test(v);
}

/** Positive amount with at most `maxInt` integer and `maxDec` fraction digits. */
export function isAmount(v: string, maxInt: number, maxDec: number): boolean {
  return new RegExp(`^\\d{1,${maxInt}}(\\.\\d{1,${maxDec}})?$`).test(v) && /[1-9]/.test(v);
}

/** Decimal string → integer units at `scale`, rounding half away from zero. */
export function toUnits(v: string, scale = 8): bigint {
  if (!DECIMAL.test(v)) throw new Error(`Invalid decimal: ${v}`);
  const neg = v.startsWith("-");
  const [int, frac = ""] = (neg ? v.slice(1) : v).split(".");
  let units = BigInt(int + frac.slice(0, scale).padEnd(scale, "0"));
  if (frac.length > scale && frac[scale] >= "5") units += ONE;
  return neg ? -units : units;
}

export function fromUnits(units: bigint, scale = 8): string {
  const neg = units < ZERO;
  const s = (neg ? -units : units).toString().padStart(scale + 1, "0");
  const out = scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s;
  return neg ? `-${out}` : out;
}

export const add = (a: string, b: string) => fromUnits(toUnits(a) + toUnits(b));
export const sub = (a: string, b: string) => fromUnits(toUnits(a) - toUnits(b));

export function cmp(a: string, b: string): -1 | 0 | 1 {
  const d = toUnits(a) - toUnits(b);
  return d > ZERO ? 1 : d < ZERO ? -1 : 0;
}

export function sign(v: string | null | undefined): -1 | 0 | 1 {
  return v && DECIMAL.test(v) ? cmp(v, "0") : 0;
}

/** v × bps / 10000, half-up at 8 decimals (non-negative v). */
export function mulBps(v: string, bps: number): string {
  const u = toUnits(v) * BigInt(bps);
  const q = u / BigInt(10000);
  const r = u % BigInt(10000);
  return fromUnits(r * BigInt(2) >= BigInt(10000) ? q + ONE : q);
}

/** a ÷ b at `dp` decimals, half away from zero; null when b is zero. Inputs are read at 18 decimals so tiny prices keep their digits. */
export function div(a: string, b: string, dp = 4): string | null {
  const d = toUnits(b, 18);
  if (d === ZERO) return null;
  const n = toUnits(a, 18) * BigInt(10) ** BigInt(dp);
  let q = n / d;
  const r = n % d;
  const abs = (x: bigint) => (x < ZERO ? -x : x);
  if (abs(r) * BigInt(2) >= abs(d)) q += n < ZERO !== d < ZERO ? -ONE : ONE;
  return fromUnits(q, dp);
}

/** Display only: rounded to `dp`, grouped, "—" for null (null ≠ zero). */
export function fmt(v: string | null | undefined, dp = 2, opts: { sign?: boolean } = {}): string {
  if (v == null || v === "") return "—";
  if (!DECIMAL.test(v)) return v;
  const u = toUnits(v, dp);
  const [int, frac] = fromUnits(u < ZERO ? -u : u, dp).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const s = u < ZERO ? "−" : opts.sign && u > ZERO ? "+" : "";
  return s + grouped + (frac ? `.${frac}` : "");
}

/** Strip trailing zeros for input prefill ("250.00000000" → "250"). */
export function trimZeros(v: string): string {
  return v.includes(".") ? v.replace(/\.?0+$/, "") : v;
}

/** Display-only ratio for charts/progress (never for money math). */
export function ratio(part: string, whole: string): number {
  const w = toUnits(whole);
  return w > ZERO ? Number((toUnits(part) * BigInt(10000)) / w) / 10000 : 0;
}

/** Display decimals for a market price: more for cheap coins (64,000 → 1 dp, 0.0123 → 5 dp). */
export function priceDp(v: string | null | undefined): number {
  const x = Math.abs(Number(v));
  return !x ? 2 : x >= 1000 ? 1 : x >= 10 ? 2 : x >= 1 ? 3 : x >= 0.01 ? 5 : 7;
}
export const fmtPrice = (v: string | null | undefined) => fmt(v, priceDp(v));
