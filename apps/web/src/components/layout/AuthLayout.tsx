import { Link, Outlet } from "@tanstack/react-router";

export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-bg-base text-fg-primary">
      <header className="mx-auto flex h-14 max-w-lg items-center px-4">
        <Link to="/" className="text-lg font-semibold">
          Atender
        </Link>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
