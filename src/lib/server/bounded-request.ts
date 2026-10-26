export class RequestBodyError extends Error {
    readonly status: 400 | 413 | 415
    constructor(status: 400 | 413 | 415, message: string) { super(message); this.status = status }
}

export function requestBodyErrorResponse(error: unknown): Response | null {
    if (!(error instanceof RequestBodyError)) return null
    return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
    if (Number(request.headers.get('content-length')) > maximum) {
        throw new RequestBodyError(413, 'The request is too large.')
    }
    const reader = request.body?.getReader()
    if (!reader) throw new RequestBodyError(400, 'A request body is required.')
    const chunks: Uint8Array[] = []
    let length = 0
    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.byteLength
            if (length > maximum) {
                await reader.cancel()
                throw new RequestBodyError(413, 'The request is too large.')
            }
            chunks.push(value)
        }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
}

export async function readBoundedJson(request: Request, maximum = 16_384): Promise<Record<string, unknown>> {
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        throw new RequestBodyError(415, 'Send this request as JSON.')
    }
    let data: unknown
    try { data = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, maximum))) }
    catch (error) {
        if (error instanceof RequestBodyError) throw error
        throw new RequestBodyError(400, 'The request could not be read.')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestBodyError(400, 'Send a JSON object.')
    return data as Record<string, unknown>
}
