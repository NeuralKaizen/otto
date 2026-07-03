const _cancelled = new Set<string>();

export function cancelMessage(messageId: string): void {
  _cancelled.add(messageId);
}

export function isCancelled(messageId: string): boolean {
  return _cancelled.has(messageId);
}

export function clearCancelled(messageId: string): void {
  _cancelled.delete(messageId);
}
