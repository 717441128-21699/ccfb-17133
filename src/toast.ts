let listener: ((msg: string) => void) | null = null;

export function toast(message: string): void {
  listener?.(message);
}

export function setToastListener(fn: ((msg: string) => void) | null): void {
  listener = fn;
}
