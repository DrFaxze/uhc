/** Generador aleatorio con la interfaz de RandomSource de Java. */
export const rand = {
  nextDouble(): number {
    return Math.random();
  },
  nextFloat(): number {
    return Math.random();
  },
  /** Entero en [0, n). */
  nextInt(n: number): number {
    return n <= 0 ? 0 : Math.floor(Math.random() * n);
  },
  nextBoolean(): boolean {
    return Math.random() < 0.5;
  },
  nextGaussian(): number {
    let u = 0;
    let w = 0;
    while (u === 0) u = Math.random();
    while (w === 0) w = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  },
  /** Entero en [lo, hi] (DragonConfig.roll). */
  roll(lo: number, hi: number): number {
    const h = Math.max(lo, hi);
    return lo + Math.floor(Math.random() * (h - lo + 1));
  },
  range(lo: number, hi: number): number {
    return lo + Math.random() * (hi - lo);
  },
  pick<T>(list: readonly T[]): T | undefined {
    return list.length === 0 ? undefined : list[Math.floor(Math.random() * list.length)];
  },
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  },
};
