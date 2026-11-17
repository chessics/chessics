export function findingHref(batchId: string, tag: string): string {
  return `/workbench/batch/${batchId}?finding=${encodeURIComponent(tag)}#diagnosis-finding`
}

export function openFinding(findings: ReadonlyArray<{ tag: string }>, asked: string | string[] | undefined): string | undefined {
  const tag = Array.isArray(asked) ? asked[0] : asked
  return tag && findings.some((f) => f.tag === tag) ? tag : undefined
}
