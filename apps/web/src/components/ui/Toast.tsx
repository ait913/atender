export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-md bg-fg-primary px-4 py-3 text-sm font-semibold text-white shadow-popover">
      {message}
    </div>
  );
}
