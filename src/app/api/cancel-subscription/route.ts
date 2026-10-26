export async function POST() {
    return Response.json({
        error: 'Subscriptions are disabled. Premium access is free.',
        code: 'SUBSCRIPTIONS_DISABLED',
    }, { status: 410 })
}
