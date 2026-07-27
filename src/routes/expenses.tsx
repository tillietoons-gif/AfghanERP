import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { money, jalaliDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  createLocalExpense,
  listLocalExpenseCategories,
  listLocalExpenses,
} from "@/lib/local-store";

export const Route = createFileRoute("/expenses")({
  component: () => (
    <ProtectedRoute>
      <ExpensesPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("لګښتونه"),
});

function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category_id: "",
    amount: 0,
    paid_by: "cash",
    description: "",
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => listLocalExpenses("", 100),
  });

  const { data: cats } = useQuery({
    queryKey: ["expense-cats"],
    queryFn: listLocalExpenseCategories,
  });

  const onSave = async () => {
    if (!form.amount || form.amount <= 0) {
      toast.error("اندازه اړینه ده");
      return;
    }
    await createLocalExpense({
      category_id: form.category_id || null,
      amount: form.amount,
      paid_by: form.paid_by,
      description: form.description || null,
    });
    toast.success("خوندي شو");
    setOpen(false);
    setForm({ category_id: "", amount: 0, paid_by: "cash", description: "" });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.expenses}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-1 h-4 w-4" />
              {t.add}
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {t.add} — {t.expenses}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t.category}</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {cats?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t.amount}</Label>
                <Input
                  type="number"
                  dir="ltr"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t.paymentMethod}</Label>
                <Select
                  value={form.paid_by}
                  onValueChange={(v) => setForm({ ...form, paid_by: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(t.payMethods).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t.description}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <Button onClick={onSave}>{t.save}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.date}</TableHead>
              <TableHead className="text-right">{t.category}</TableHead>
              <TableHead className="text-right">{t.description}</TableHead>
              <TableHead className="text-right">{t.paymentMethod}</TableHead>
              <TableHead className="text-right">{t.amount}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses?.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{jalaliDateTime(e.expense_date)}</TableCell>
                <TableCell>{e.category_name ?? "—"}</TableCell>
                <TableCell>{e.description ?? "—"}</TableCell>
                <TableCell>{t.payMethods[e.paid_by ?? ""] ?? e.paid_by ?? "—"}</TableCell>
                <TableCell className="font-semibold">{money(e.amount)}</TableCell>
              </TableRow>
            ))}
            {(!expenses || expenses.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t.noData}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
