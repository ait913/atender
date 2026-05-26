export function ReturnToNowFAB({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-card md:bottom-8" onClick={onClick}>
      今に戻る
    </button>
  );
}
