import sql from './db'
import { mergeAutomationStatuses } from './automation-jobs'

export interface AutomationStatusRecord {
  job_key: string
  job_name: string
  status: 'ok' | 'warning' | 'error'
  severity: 'info' | 'low' | 'medium' | 'high'
  message: string
  summary_json: unknown | null
  last_run_at: string
  created_at: string
  updated_at: string
}

export async function upsertAutomationStatus(input: {
  jobKey: string
  jobName: string
  status: AutomationStatusRecord['status']
  severity: AutomationStatusRecord['severity']
  message: string
  summary: unknown | null
}) {
  const rows = await sql`
    INSERT INTO automation_status (
      job_key, job_name, status, severity, message, summary_json, last_run_at, updated_at
    ) VALUES (
      ${input.jobKey},
      ${input.jobName},
      ${input.status},
      ${input.severity},
      ${input.message},
      ${input.summary ? JSON.stringify(input.summary) : null}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (job_key) DO UPDATE SET
      job_name = EXCLUDED.job_name,
      status = EXCLUDED.status,
      severity = EXCLUDED.severity,
      message = EXCLUDED.message,
      summary_json = EXCLUDED.summary_json,
      last_run_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `

  return rows[0] as unknown as AutomationStatusRecord
}

export async function getAutomationStatus(jobKey: string) {
  const rows = await sql`
    SELECT *
    FROM automation_status
    WHERE job_key = ${jobKey}
    LIMIT 1
  `

  return (rows[0] ?? null) as AutomationStatusRecord | null
}

export async function listAutomationStatuses() {
  const rows = await sql`
    SELECT *
    FROM automation_status
    ORDER BY updated_at DESC, job_key ASC
  `

  return rows as unknown as AutomationStatusRecord[]
}

export async function listAutomationStatusesWithDefinitions() {
  const rows = await listAutomationStatuses()
  return mergeAutomationStatuses(rows)
}
