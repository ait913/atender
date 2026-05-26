import type { ReactNode } from "react";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-normal text-fg-primary">{title}</h1>
      {children ? <p className="mt-1 text-sm text-fg-secondary">{children}</p> : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-border-subtle bg-bg-elevated p-4 shadow-card ${className}`}>{children}</section>;
}

export function Mascot({ className = "" }: { className?: string }) {
  return <img src="/character/mascot-hello-1024.png" alt="" className={`object-contain ${className}`} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-border-subtle bg-bg-muted px-6 py-10 text-center">
      <Mascot className="h-36 w-36" />
      <p className="mt-4 text-lg font-semibold text-fg-primary">{title}</p>
      {children ? <p className="mt-2 max-w-sm text-sm text-fg-secondary">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
