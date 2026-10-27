import 'server-only'
import { guardRuntimeRequest } from '@/lib/server/runtime-guard'

type RuntimeHandler<Context> = (request: Request, context: Context) => Response | Promise<Response>

/**
 * Keep distributed accounting beside the handler/data source, not in the global
 * routing proxy. Every exported API method uses this boundary; neither caller
 * headers nor a browser session can skip it. Actor/permission checks remain the
 * handler's responsibility and run before its own data or provider work.
 */
export function withRuntimeGuard<Context>(handler: RuntimeHandler<Context>): RuntimeHandler<Context> {
    return async (request, context) => {
        const denied = await guardRuntimeRequest(request)
        const response = denied ?? await handler(request, context)
        // Do not buffer/copy streamed bodies. Preserve cookies, provider headers
        // and existing Vary dimensions while keeping account responses private.
        response.headers.set('Cache-Control', 'private, no-store')
        const vary = response.headers.get('Vary')
        if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'cookie') && vary !== '*') {
            response.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie')
        }
        return response
    }
}
