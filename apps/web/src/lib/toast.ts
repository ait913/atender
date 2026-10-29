let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getToastMessage(): string | null {
  return message;
}

export function showToast(nextMessage: string): void {
  if (timer !== undefined) clearTimeout(timer);
  message = nextMessage;
  timer = setTimeout(() => {
    message = null;
    timer = undefined;
    listeners.forEach((listener) => listener());
  }, 2600);
  listeners.forEach((listener) => listener());
}
