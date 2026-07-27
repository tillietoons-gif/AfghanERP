import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bug } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { countLocalErrorReports } from "@/lib/local-store";

// Small badge for admins showing unresolved error count. Polls every 30s.
export function ErrorAlertBadge() {
  const { roles } = useAuth();
  const isStaff = roles.some((r: AppRole) =>
    (["owner", "admin", "manager"] as AppRole[]).includes(r),
  );

  const q = useQuery({
    queryKey: ["unresolved_error_count"],
    enabled: isStaff,
    queryFn: () => countLocalErrorReports({ resolved: false }),
    refetchInterval: 30_000,
  });

  if (!isStaff || !q.data || q.data === 0) return null;

  return (
    <Link
      to="/errors"
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition"
      title="ناحل شوې تېروتنې"
    >
      <Bug className="h-3.5 w-3.5" />
      <span>{q.data}</span>
    </Link>
  );
}
