import { updateFreeProfileUsername } from '@/lib/free-profile-username'

export async function POST(request: Request) {
    return updateFreeProfileUsername(request, 'desiredUsername')
}
