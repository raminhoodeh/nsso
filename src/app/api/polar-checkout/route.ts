// Keep old clients from starting a paid subscription while premium access is free.
export async function POST() {
    return Response.json({
        error: 'Subscriptions are disabled. Premium access is free.',
        code: 'SUBSCRIPTIONS_DISABLED',
    }, { status: 410 })
}
