/**
 * Mirror of `splitProportionally` in the server's proportional-award.service.
 * Lives here so the preview table matches what the server will actually hand
 * out — the server stays the source of truth and recomputes on apply.
 */
export function splitProportionally(points: number[], total: number): number[] {
  const zeros = points.map(() => 0);
  const sum = points.reduce((acc, p) => acc + p, 0);
  if (sum <= 0 || total === 0) return zeros;

  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);

  const exact = points.map((p) => (magnitude * p) / sum);
  const base = exact.map((v) => Math.floor(v));
  let leftover = magnitude - base.reduce((acc, v) => acc + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || points[b.i] - points[a.i] || a.i - b.i);

  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    base[order[k].i] += 1;
    leftover -= 1;
  }

  return base.map((v) => v * sign);
}
