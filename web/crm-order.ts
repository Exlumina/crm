/** The shared writer accepts finite membership orders in the closed 0..1e12 range. */
const maximumOrder = 1e12;
const boundedOrder = (order: number): number => Number.isFinite(order) ? Math.min(maximumOrder, Math.max(0, order)) : 0;

export function appendMembershipOrder(orders: readonly number[]): number {
  if (!orders.length) return 0;
  return Math.min(maximumOrder, Math.max(...orders.map(boundedOrder)) + 1024);
}

export function insertMembershipOrder(previous: number, next: number): number {
  const low = boundedOrder(previous), high = boundedOrder(next);
  return high > low ? low + (high - low) / 2 : high;
}
