export function isAuthorizedCronRequest(req: Request): boolean {
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim()
  const secret = process.env.CRON_SECRET

  if (secret && bearerToken === secret) {
    return true
  }

  const vercelCronHeader = req.headers.get('x-vercel-cron')
  return vercelCronHeader === '1'
}
