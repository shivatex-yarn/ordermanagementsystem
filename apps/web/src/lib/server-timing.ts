export type TimingMark = {
  name: string;
  durMs: number;
  desc?: string;
};

export function timingHeaderValue(marks: TimingMark[]): string {
  return marks
    .filter((m) => Number.isFinite(m.durMs) && m.durMs >= 0)
    .map((m) => {
      const dur = Math.round(m.durMs);
      const desc = m.desc ? `;desc="${String(m.desc).replace(/"/g, "")}"` : "";
      return `${m.name};dur=${dur}${desc}`;
    })
    .join(", ");
}

export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ value: T; mark: TimingMark }> {
  const t0 = performance.now();
  const value = await fn();
  const t1 = performance.now();
  return { value, mark: { name, durMs: t1 - t0 } };
}

