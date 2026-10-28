export function periodLabel(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  return 'Older';
}

const PERIOD_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

export function groupByPeriod<T extends { updatedAt: string }>(items: T[], now: Date = new Date()): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = periodLabel(item.updatedAt, now);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return PERIOD_ORDER.filter((label) => groups.has(label)).map((label) => ({ label, items: groups.get(label)! }));
}
