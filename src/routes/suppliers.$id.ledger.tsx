import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { EntityLedger } from "@/components/entity-ledger";
import { t } from "@/lib/i18n";

type LedgerSearch = { from?: string; to?: string };

export const Route = createFileRoute("/suppliers/$id/ledger")({
  validateSearch: (s: Record<string, unknown>): LedgerSearch => ({
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
  component: SupplierLedgerRoute,
  errorComponent: makeRouteErrorComponent(t.suppliers),
  notFoundComponent: () => (
    <div className="p-6 text-center text-muted-foreground">{t.entityNotFound}</div>
  ),
});

function SupplierLedgerRoute() {
  const { id } = Route.useParams();
  const { from, to } = Route.useSearch();
  return (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager", "inventory_officer", "accountant"]}>
      <EntityLedger kind="supplier" id={id} initialFrom={from} initialTo={to} />
    </ProtectedRoute>
  );
}
