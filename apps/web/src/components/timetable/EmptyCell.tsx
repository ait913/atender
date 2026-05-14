export function EmptyCell({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-16 rounded-md border border-dashed border-border-subtle bg-bg-base transition hover:bg-bg-muted"
      onClick={onClick}
      aria-label="授業を追加"
    />
  );
}
