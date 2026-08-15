import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
