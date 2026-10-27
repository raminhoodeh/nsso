import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { updateFreeProfileUsername } from '@/lib/free-profile-username'

async function handlePOST(request: Request) {
    return updateFreeProfileUsername(request, 'desiredUsername')
}

export const POST = withRuntimeGuard(handlePOST)
