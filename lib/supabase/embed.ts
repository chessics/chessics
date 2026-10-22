export type OneOrMany<T> = T | T[] | null | undefined

export const one = <T>(v: OneOrMany<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
