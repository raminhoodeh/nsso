import { withRuntimeGuard } from '@/lib/server/runtime-route'
// Retired billing events must never revoke free access or change usernames.
async function handlePOST() {
    return Response.json({
        error: 'Subscriptions are disabled. Premium access is free.',
        code: 'SUBSCRIPTIONS_DISABLED',
    }, { status: 410 })
}

export const POST = withRuntimeGuard(handlePOST)
