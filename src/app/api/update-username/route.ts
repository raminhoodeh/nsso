import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { updateFreeProfileUsername } from '@/lib/free-profile-username'

async function handlePOST(request: Request) {
    return updateFreeProfileUsername(request, 'username')
}

export const POST = withRuntimeGuard(handlePOST)
