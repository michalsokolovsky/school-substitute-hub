import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/_authenticated/admin/teachers")({
  beforeLoad: () => requireAdmin(),
  component: AdminTeachersLayout,
});

function AdminTeachersLayout() {
  return <Outlet />;
}
