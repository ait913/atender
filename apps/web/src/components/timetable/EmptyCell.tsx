export function EmptyCell({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="group grid h-full min-h-0 w-full place-items-center bg-bg-base transition hover:bg-bg-muted" onClick={onClick}>
      <span className="text-xl font-semibold text-fg-tertiary opacity-0 transition group-hover:opacity-60">+</span>
    </button>
  );
}
