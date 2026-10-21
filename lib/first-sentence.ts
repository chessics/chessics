export function firstSentence(text: string): string {
  const end = /[.!?]\s+/.exec(text)
  return end ? text.slice(0, end.index + 1) : text
}
