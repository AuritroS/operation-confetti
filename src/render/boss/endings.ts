/** Shared presentation path keeps Aurora, her magic and the cake together. */
export function escapeOffset(progress: number): { x: number; y: number; z: number } {
  const t = Math.max(0, Math.min(1, (progress - 0.15) / 0.85));
  const lift = t * t;
  return { x: lift * 3, y: lift * 12, z: -lift * 6 };
}

export function endingEase(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
