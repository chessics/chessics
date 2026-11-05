import { SITE_TAGLINE } from '@/lib/site'
import ProofBoard from './ProofBoard'
import { PROOF_HEADING, proofCaption, proofSentences } from './proof'
import './landing.css'

export const LANDING_H1 = 'Find the move where your chess games turned.'

export function LandingHead() {
  return (
    <div className="landing-head flex flex-col gap-4">
      <h1 className="font-headline landing-h1">{LANDING_H1}</h1>
      <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
        {SITE_TAGLINE}
      </p>
    </div>
  )
}

export function LandingProof() {
  const [where, arrow] = proofCaption()
  return (
    <section className="landing-proof flex flex-col gap-5" aria-labelledby="landing-proof-heading">
      <hr className="hairline" />
      <h2 id="landing-proof-heading" className="font-headline" style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 500, color: 'var(--text)' }}>
        {PROOF_HEADING}
      </h2>
      <div className="landing-proof-body">
        <figure className="landing-figure flex flex-col gap-2">
          <ProofBoard />
          <figcaption className="text-xs flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            <span>{where}</span>
            <span>{arrow}</span>
          </figcaption>
        </figure>
        <div className="landing-proof-text flex flex-col gap-4">
          {proofSentences().map((s) => (
            <p key={s} className="text-base" style={{ color: 'var(--text)', lineHeight: 1.6 }}>
              {s}
            </p>
          ))}
          <p className="text-sm">
            <a href="/example" style={{ color: 'var(--gold-dim)', textDecoration: 'underline' }}>
              See an example report
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
