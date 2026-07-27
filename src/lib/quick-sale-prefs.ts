// Quick-sale defaults, persisted in localStorage.

export interface QuickSalePrefs {
  allowDiscounts: boolean; // let cashier enter invoice discount in quick mode
  forceCash: boolean; // force cash payment method
  showPreviewLater: boolean; // after quick sale, open receipt preview instead of just toast
  autoCommitMinutes: number; // 0 = disabled; auto-commit idle cart after N minutes
  autoCommitItemCount: number; // 0 = disabled; auto-commit when total item count >= N
}

const KEY = "quick_sale.prefs.v1";

export const defaultQuickSalePrefs: QuickSalePrefs = {
  allowDiscounts: false,
  forceCash: true,
  showPreviewLater: false,
  autoCommitMinutes: 0,
  autoCommitItemCount: 0,
};

export function getQuickSalePrefs(): QuickSalePrefs {
  if (typeof window === "undefined") return defaultQuickSalePrefs;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultQuickSalePrefs;
    return { ...defaultQuickSalePrefs, ...(JSON.parse(raw) as Partial<QuickSalePrefs>) };
  } catch {
    return defaultQuickSalePrefs;
  }
}

export function setQuickSalePrefs(patch: Partial<QuickSalePrefs>): QuickSalePrefs {
  const next = { ...getQuickSalePrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("quick-sale-prefs-change"));
  } catch {
    /* ignore */
  }
  return next;
}
