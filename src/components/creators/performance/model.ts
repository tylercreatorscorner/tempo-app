export interface PerformancePoint {
  /** Stable reporting-period key, supplied by the authorized server adapter. */
  key: string;
  label: string;
  axisLabel?: string;
  gmv: number | null;
  posts: number | null;
}

export function normalizePoints(points: readonly PerformancePoint[]): PerformancePoint[] {
  const keys = new Set<string>();
  return points.map(point => {
    if (!point.key) throw new Error('Performance period key is required');
    if (keys.has(point.key)) throw new Error('Duplicate performance period');
    keys.add(point.key);
    return {
      ...point,
      gmv: point.gmv !== null && Number.isFinite(point.gmv) ? point.gmv : null,
      posts: point.posts !== null && Number.isInteger(point.posts) && point.posts >= 0 ? point.posts : null,
    };
  });
}

/** Incomplete data is not silently presented as a complete period total. */
export function total(points: readonly PerformancePoint[], metric: 'gmv' | 'posts'): number | null {
  if (!points.length || points.some(point => point[metric] === null)) return null;
  return points.reduce((sum, point) => sum + (point[metric] ?? 0), 0);
}

export function nearestPeriod(x: number, left: number, right: number, count: number): number | null {
  if (count < 1 || right <= left) return null;
  return Math.max(0, Math.min(count - 1, Math.floor((x - left) / (right - left) * count)));
}
