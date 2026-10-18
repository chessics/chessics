'use client'

export const INTRO_STEPS = [
  'Every position comes from one of your own games, at the moment things started to go wrong.',
  'Find the best move. Drag a piece to draw an arrow. It snaps back, so you can try a few. Then press Commit.',
  "You'll see the best move, and what really happened in your game.",
  "Positions you miss come back in 3 days, then a week, then two weeks. Get one right three times in a row and it's done.",
] as const

export function IntroSteps() {
  return (
    <ol className="training-intro-steps">
      {INTRO_STEPS.map((step, i) => (
        <li key={i}>
          <span className="training-intro-num" aria-hidden>
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

export default function TrainingIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="training-intro">
      <h1 className="training-title">How training works</h1>
      <IntroSteps />
      <p className="training-hint">There&apos;s no clock. Take your time.</p>
      <div className="training-actions">
        <button className="training-btn training-btn-primary" onClick={onStart} autoFocus>
          Start training
        </button>
      </div>
    </div>
  )
}
