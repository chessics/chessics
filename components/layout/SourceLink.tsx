export const SOURCE_REPO_URL = 'https://github.com/chessics/chessics'

export function sourceUrl(commitSha: string | undefined = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA): string {
  const sha = commitSha?.trim()
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? `${SOURCE_REPO_URL}/tree/${sha}` : SOURCE_REPO_URL
}

export default function SourceLink() {
  return (
    <a href={sourceUrl()} rel="noopener noreferrer" style={{ color: 'var(--text-dim)', textDecoration: 'underline' }}>
      Source code
    </a>
  )
}
