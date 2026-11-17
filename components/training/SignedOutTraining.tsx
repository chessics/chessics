export const SIGNED_OUT_LINE = 'Training uses positions from your own games.'

export default function SignedOutTraining() {
  return (
    <div className="training-done">
      <h1 className="training-title">{SIGNED_OUT_LINE}</h1>
      <p className="training-hint">Analyze a batch first, then sign up to keep it and train it here.</p>
      <div className="training-actions">
        <a className="training-btn training-btn-primary" href="/">Analyze my games</a>
        <a className="training-btn training-btn-quiet" href="/signup">Sign up</a>
        <a className="training-btn training-btn-quiet" href="/login">Sign in</a>
      </div>
    </div>
  )
}
