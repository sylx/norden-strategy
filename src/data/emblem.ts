const EMBLEMS = import.meta.glob<string>('../assets/emblems/emblem_*.webp', { eager: true, import: 'default' })

/** Numbers of the emblem images (src/assets/emblems/emblem_NN.webp), in order */
export const EMBLEM_NUMBERS: readonly number[] = Object.keys(EMBLEMS)
  .map((file) => Number(/emblem_(\d+)\.webp$/.exec(file)?.[1]))
  .sort((a, b) => a - b)

/** URL of an emblem image by its number; undefined when there is none */
export const emblemImage = (emblem: number | undefined): string | undefined =>
  emblem ? EMBLEMS[`../assets/emblems/emblem_${String(emblem).padStart(2, '0')}.webp`] : undefined
