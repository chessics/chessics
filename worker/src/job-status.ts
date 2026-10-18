export const JOB_STATUS_TTL_S = 3600

export interface JobStatusRecord {
  status: string
  stage: number
  progress: number
  stageDetail?: string
  errorMessage?: string
  updatedAt: string
}

export function jobStatusRecord(
  status: string,
  stage: number,
  progress: number,
  stageDetail: string | undefined,
  errorMessage: string | undefined,
  now: Date = new Date()
): JobStatusRecord {
  return { status, stage, progress, stageDetail, errorMessage, updatedAt: now.toISOString() }
}
