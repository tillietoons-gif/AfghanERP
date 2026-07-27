import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { CrudListPage } from "@/components/crud-list";
import { buttonVariants } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/customers/")({
  component: () => (
    <ProtectedRoute>
      <CrudListPage
        table="customers"
        title={t.customers}
        fields={[
          { key: "name", label: t.name, required: true },
          { key: "phone", label: t.phone, dir: "ltr", placeholder: "+93..." },
          { key: "address", label: t.address },
          {
            key: "opening_balance",
            label: "ابتدایي بیلانس",
            type: "number",
            dir: "ltr",
            createOnly: true,
          },
          { key: "province", label: t.province },
          { key: "notes", label: t.notes, textarea: true },
        ]}
        columns={[
          { key: "name", label: t.name, sortable: true },
          { key: "phone", label: t.phone, ltr: true },
          { key: "balance", label: t.balance, money: true, sortable: true },
          { key: "province", label: t.province, sortable: true },
        ]}
        extraRowActions={(row) => (
          <Link
            to="/customers/$id/ledger"
            params={{ id: row.id }}
            className={buttonVariants({ size: "icon", variant: "ghost" })}
            title="کتابچه / حساب"
            aria-label="کتابچه"
          >
            <BookOpen className="h-4 w-4" />
          </Link>
        )}
      />
    </ProtectedRoute>
  ),
  errorComponent: makeRouteErrorComponent("پیرودونکي"),
});
