import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createPrivilegedClient } from '@/lib/server/permissions'

export const dynamic = 'force-dynamic'
async function handleGET() {
    const headers = { 'Cache-Control': 'private, no-store' }
    const revision = process.env.NEXT_PUBLIC_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'development'
    try {
        const { data, error } = await createPrivilegedClient().rpc('nsso_security_health')
        if (error || data?.healthy !== true) return Response.json({ status: 'unavailable', revision }, { status: 503, headers })
        return Response.json({ status: 'ok', revision }, { headers })
    } catch { return Response.json({ status: 'unavailable', revision }, { status: 503, headers }) }
}

export const GET = withRuntimeGuard(handleGET)
