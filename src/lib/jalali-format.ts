// Tiny wrapper for jalali formatting to avoid re-importing everywhere
import { format } from "date-fns-jalali";
export function formatJalali(d: Date, pattern: string): string {
  return format(d, pattern);
}
