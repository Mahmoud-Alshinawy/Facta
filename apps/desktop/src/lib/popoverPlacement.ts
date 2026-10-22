/** All coordinates are relative to the grid body, including its visible bounds. */
export function popoverTop({ start, end, height, visibleTop, visibleBottom, gap = 8 }: {
  start: number;
  end: number;
  height: number;
  visibleTop: number;
  visibleBottom: number;
  gap?: number;
}): number {
  const below = end + gap;
  const preferred = below + height <= visibleBottom ? below : start - height - gap;
  return Math.max(visibleTop, Math.min(preferred, visibleBottom - height));
}
