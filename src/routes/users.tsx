import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/protected-route";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  grantLocalOperatorRole,
  listLocalOperatorRoles,
  listLocalOperators,
  revokeLocalOperatorRole,
} from "@/lib/local-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2, Plus } from "lucide-react";

const ROLES = ["owner", "admin", "manager", "cashier", "inventory_officer", "accountant"] as const;
type Role = (typeof ROLES)[number];

export const Route = createFileRoute("/users")({
  component: () => (
    <ProtectedRoute allowedRoles={["owner", "admin"]}>
      <UsersPage />
    </ProtectedRoute>
  ),

  errorComponent: makeRouteErrorComponent("کارونکي"),
});

function UsersPage() {
  const { roles: myRoles } = useAuth();
  const qc = useQueryClient();
  const canManage = myRoles.includes("owner") || myRoles.includes("admin");

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: listLocalOperators,
    enabled: canManage,
  });

  const { data: userRoles } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: listLocalOperatorRoles,
    enabled: canManage,
  });

  const [pending, setPending] = useState<Record<string, Role>>({});

  const addRole = async (userId: string, role: Role) => {
    try {
      await grantLocalOperatorRole(userId, role);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رول زیات نه شو");
      return;
    }
    toast.success("رول زیات شو");
    qc.invalidateQueries({ queryKey: ["all-user-roles"] });
  };

  const removeRole = async (id: string) => {
    if (!confirm(t.areYouSure)) return;
    try {
      await revokeLocalOperatorRole(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رول ړنګ نه شو");
      return;
    }
    toast.success("ړنګ شو");
    qc.invalidateQueries({ queryKey: ["all-user-roles"] });
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-muted-foreground">
          دا مخ یوازې د مالک/مدیر لپاره دی
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold">کارونکي او رولونه</h1>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">{t.fullName}</TableHead>
              <TableHead className="text-right">{t.phone}</TableHead>
              <TableHead className="text-right">رولونه</TableHead>
              <TableHead className="text-right">نوی رول</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  {t.loading}
                </TableCell>
              </TableRow>
            )}
            {profiles?.map((p) => {
              const myRolesRows = (userRoles ?? []).filter((r) => r.user_id === p.id);
              const usedRoles = new Set(myRolesRows.map((r) => r.role));
              const available = ROLES.filter((r) => !usedRoles.has(r));
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell dir="ltr" className="text-right">
                    {p.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {myRolesRows.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {myRolesRows.map((r) => (
                        <Badge key={r.id} variant="secondary" className="gap-1">
                          {t.roles[r.role as Role] ?? r.role}
                          <button
                            onClick={() => removeRole(r.id)}
                            className="ml-1 opacity-70 hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {available.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Select
                          value={pending[p.id] ?? ""}
                          onValueChange={(v) => setPending((s) => ({ ...s, [p.id]: v as Role }))}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {available.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t.roles[r] ?? r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!pending[p.id]}
                          onClick={() => pending[p.id] && addRole(p.id, pending[p.id])}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        نوي کارونکي د ننوتلو مخ له لارې خپل حساب جوړوي، وروسته یې دلته رولونه ورکړئ.
      </p>
    </div>
  );
}
