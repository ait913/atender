import { Link, Outlet } from "@tanstack/react-router";

export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-bg-base text-fg-primary">
      <header className="mx-auto flex h-14 max-w-lg items-center px-4">
        <Link to="/" className="flex items-center gap-2" aria-label="Atender">
          <img src="/logo-mark.png" srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x" alt="" width={24} height={24} className="shrink-0" />
          <img src="/wordmark-navy.png" alt="Atender" className="wordmark-light h-[19px] w-auto" />
          <img src="/wordmark-white.png" alt="Atender" className="wordmark-dark h-[19px] w-auto" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
