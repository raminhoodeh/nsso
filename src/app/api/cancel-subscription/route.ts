import { withRuntimeGuard } from '@/lib/server/runtime-route'
async function handlePOST() {
    return Response.json({
        error: 'Subscriptions are disabled. Premium access is free.',
        code: 'SUBSCRIPTIONS_DISABLED',
    }, { status: 410 })
}

export const POST = withRuntimeGuard(handlePOST)
