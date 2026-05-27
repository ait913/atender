// 個人時間割の course.color と同じ palette。両モードで見栄え検証済の固定 5 色。
const PALETTE = [
  "#10b981", // emerald
  "#60a5fa", // blue
  "#f472b6", // pink
  "#8b5cf6", // violet
  "#f59e0b", // amber
] as const;

export function memberColor(seed: string): string {
  if (seed.length === 0) return PALETTE[0];
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
