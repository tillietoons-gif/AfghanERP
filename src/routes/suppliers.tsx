import { makeRouteErrorComponent } from "@/components/route-error-page";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/suppliers")({
  component: () => <Outlet />,
  errorComponent: makeRouteErrorComponent("پلورونکي"),
});
