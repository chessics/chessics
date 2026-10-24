export function countNoun(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`
}
