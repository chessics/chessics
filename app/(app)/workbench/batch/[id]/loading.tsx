import PageLoading from '@/components/layout/PageLoading'
import { REPORT_COLUMN } from '@/components/report/column'

export default function Loading() {
  return <PageLoading label="Loading the report" width={REPORT_COLUMN} />
}
