import { Outlet } from "@tanstack/react-router";

export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-bg-base text-fg-primary">
      <header className="flex h-12 items-center justify-center border-b border-border-subtle bg-bg-muted text-base font-bold">Atender</header>
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center px-5 py-8">
        <Outlet />
      </main>
    </div>
  );
}
