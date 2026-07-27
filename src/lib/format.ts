import { format as formatJalali } from "date-fns-jalali";

const PS_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPashtoDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/[0-9]/g, (d) => PS_DIGITS[Number(d)]);
}

export function money(amount: number | string | null | undefined, symbol = "؋"): string {
  const n = Number(amount ?? 0);
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
  return `${toPashtoDigits(formatted)} ${symbol}`;
}

export function num(n: number | string | null | undefined, digits = 0): string {
  const v = Number(n ?? 0);
  return toPashtoDigits(v.toFixed(digits));
}

export function jalaliDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  try {
    return toPashtoDigits(formatJalali(new Date(iso), "yyyy/MM/dd"));
  } catch {
    return "";
  }
}

export function jalaliDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  try {
    return toPashtoDigits(formatJalali(new Date(iso), "yyyy/MM/dd HH:mm"));
  } catch {
    return "";
  }
}
