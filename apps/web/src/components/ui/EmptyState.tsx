import type { ReactNode } from "react";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-black tracking-tight text-fg-primary md:text-4xl">{title}</h1>
      {children ? <p className="mt-2 text-sm text-fg-secondary">{children}</p> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl bg-bg-elevated p-5 shadow-card ${className}`}
    >
      {children}
    </section>
  );
}

export function Mascot({ className = "" }: { className?: string }) {
  return <img src="/character/mascot-hello-1024.png" alt="" className={`object-contain ${className}`} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-fg-primary/4 px-6 py-12 text-center">
      <Mascot className="h-32 w-32 opacity-90" />
      <p className="mt-4 text-xl font-bold text-fg-primary">{title}</p>
      {children ? <p className="mt-2 max-w-sm text-sm text-fg-secondary">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
