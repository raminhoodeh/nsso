import { withRuntimeGuard } from '@/lib/server/runtime-route'
/** Retired: URL health checks must not expose an arbitrary server-side fetch. */
async function handlePOST() {
    return Response.json({ valid: false, status: 'unverified', code: 'LINK_HEALTH_UNAVAILABLE',
        error: 'Link reachability is not checked. You can still save a valid web link.' }, {
        status: 410, headers: { 'Cache-Control': 'no-store' },
    });
}

export const POST = withRuntimeGuard(handlePOST)
