import { withRuntimeGuard } from '@/lib/server/runtime-route'
// Keep old clients from starting a paid subscription while premium access is free.
async function handlePOST() {
    return Response.json({
        error: 'Subscriptions are disabled. Premium access is free.',
        code: 'SUBSCRIPTIONS_DISABLED',
    }, { status: 410 })
}

export const POST = withRuntimeGuard(handlePOST)
