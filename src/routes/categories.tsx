import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { CrudListPage } from "@/components/crud-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/categories")({
  component: () => (
    <ProtectedRoute>
      <div className="p-4 md:p-6">
        <h1 className="mb-4 text-2xl font-bold">
          {t.category} / {t.brand}
        </h1>
        <Tabs defaultValue="categories" dir="rtl">
          <TabsList>
            <TabsTrigger value="categories">{t.category}</TabsTrigger>
            <TabsTrigger value="brands">{t.brand}</TabsTrigger>
            <TabsTrigger value="expense_categories">د لګښت کټګورۍ</TabsTrigger>
          </TabsList>
          <TabsContent value="categories">
            <CrudListPage
              table="categories"
              title={t.category}
              fields={[{ key: "name", label: t.name, required: true }]}
              columns={[{ key: "name", label: t.name, sortable: true }]}
            />
          </TabsContent>
          <TabsContent value="brands">
            <CrudListPage
              table="brands"
              title={t.brand}
              fields={[{ key: "name", label: t.name, required: true }]}
              columns={[{ key: "name", label: t.name, sortable: true }]}
            />
          </TabsContent>
          <TabsContent value="expense_categories">
            <CrudListPage
              table="expense_categories"
              title="د لګښت کټګورۍ"
              fields={[{ key: "name", label: t.name, required: true }]}
              columns={[{ key: "name", label: t.name, sortable: true }]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("کټګورۍ"),
});
