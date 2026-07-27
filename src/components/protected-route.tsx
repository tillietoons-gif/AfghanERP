import { Navigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import type { ReactNode } from "react";

export function ProtectedRoute({
  children,
  allowedRoles,
  bare = false,
}: {
  children: ReactNode;
  allowedRoles?: AppRole[];
  /** When true, render children without AppShell chrome (for print/receipt pages). */
  bare?: boolean;
}) {
  const { user, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">بار کول...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const permitted = roles.some((r) => allowedRoles.includes(r));
    if (!permitted) {
      if (bare) {
        return (
          <div className="flex min-h-screen items-center justify-center p-6">
            <Card className="p-8 text-center">
              <h2 className="mb-2 text-lg font-bold">دخول اجازه نشته</h2>
              <p className="text-sm text-muted-foreground">
                دا مخ یوازې د دې رولونو لپاره دی: {allowedRoles.join("، ")}
              </p>
            </Card>
          </div>
        );
      }
      return (
        <AppShell>
          <div className="p-6">
            <Card className="p-8 text-center">
              <h2 className="mb-2 text-lg font-bold">دخول اجازه نشته</h2>
              <p className="text-sm text-muted-foreground">
                دا مخ یوازې د دې رولونو لپاره دی: {allowedRoles.join("، ")}
              </p>
            </Card>
          </div>
        </AppShell>
      );
    }
  }

  if (bare) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
