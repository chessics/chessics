export const SHARE_SLUG_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SHARE_SLUG_LENGTH = 8

export const SHARE_SLUG_SQL_PATTERN = `^[A-Za-z0-9]{${SHARE_SLUG_LENGTH}}$`
const SHARE_SLUG = new RegExp(SHARE_SLUG_SQL_PATTERN)

export function isShareSlug(value: unknown): value is string {
  return typeof value === 'string' && SHARE_SLUG.test(value)
}

type RandomBytes = (n: number) => Uint8Array

const cryptoBytes: RandomBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n))

const LIMIT = 256 - (256 % SHARE_SLUG_ALPHABET.length)

export function newShareSlug(random: RandomBytes = cryptoBytes): string {
  let out = ''
  while (out.length < SHARE_SLUG_LENGTH) {
    const bytes = random(SHARE_SLUG_LENGTH - out.length)
    if (bytes.length === 0) throw new Error('no random bytes')
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b < LIMIT && out.length < SHARE_SLUG_LENGTH) out += SHARE_SLUG_ALPHABET[b % SHARE_SLUG_ALPHABET.length]
    }
  }
  return out
}

export function sharePath(slug: string): string {
  return `/p/${slug}`
}
