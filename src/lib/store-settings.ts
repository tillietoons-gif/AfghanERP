import { useQuery } from "@tanstack/react-query";
import { getLocalStoreSettings } from "@/lib/local-store";

/**
 * Centralized, typed access to the singleton store_settings row.
 * Uses an explicit column list so we never fetch the whole row for the
 * few fields the UI actually needs.
 */
export interface StoreSettings {
  store_name: string | null;
  address: string | null;
  phone: string | null;
  tax_number: string | null;
  currency: string | null;
  receipt_footer: string | null;
  quick_sale_allow_discounts: boolean | null;
  quick_sale_force_cash: boolean | null;
  quick_sale_show_preview: boolean | null;
  audit_retention_days: number | null;
}

export async function fetchStoreSettings(): Promise<StoreSettings | null> {
  const settings = await getLocalStoreSettings();
  return {
    ...settings,
    quick_sale_allow_discounts: Boolean(settings.quick_sale_allow_discounts),
    quick_sale_force_cash: Boolean(settings.quick_sale_force_cash),
    quick_sale_show_preview: Boolean(settings.quick_sale_show_preview),
  };
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ["store-settings"],
    queryFn: fetchStoreSettings,
    staleTime: 60_000,
  });
}
