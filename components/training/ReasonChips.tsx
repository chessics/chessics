'use client'

import { chipOrder, GOAL_LABEL, type Goal } from '@/lib/training/reason'

interface ReasonChipsProps {
  positionId: string
  goal: Goal | null
  disabled: boolean
  onPick: (goal: Goal) => void
}

export default function ReasonChips({ positionId, goal, disabled, onPick }: ReasonChipsProps) {
  return (
    <div className="training-reason-ask">
      <p className="training-reason-prompt">
        {goal === null ? 'First, pick what your move should do.' : 'Your reason. You can change it until you commit.'}
      </p>
      <div className="training-chips" role="group" aria-label="Your reason">
        {chipOrder(positionId).map(g => (
          <button key={g} className="training-chip" aria-pressed={goal === g} disabled={disabled} onClick={() => onPick(g)}>
            {GOAL_LABEL[g]}
          </button>
        ))}
      </div>
    </div>
  )
}
