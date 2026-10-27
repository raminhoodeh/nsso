import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createPrivilegedClient, permissionErrorResponse, requirePermission } from '@/lib/server/permissions';
import { readBoundedBody, RequestBodyError, requestBodyErrorResponse } from '@/lib/server/bounded-request';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

function field(form: FormData, name: string, maximum: number): string | undefined {
    const value = form.get(name);
    if (value === null) return undefined;
    if (typeof value !== 'string' || value.length > maximum) throw new RequestBodyError(400, `Invalid ${name}.`);
    return value;
}

async function handlePOST(request: Request) {
    try {
        const { user } = await requirePermission('razinflix:manage', request);
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new RequestBodyError(415, 'Send the film as form data.');
        const bytes = await readBoundedBody(request, MAX_IMAGE_BYTES + 32_768);
        let form: FormData;
        try {
            form = await new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': contentType } }).formData();
        } catch { throw new RequestBodyError(400, 'The film could not be read.'); }

        const id = field(form, 'id', 20);
        if (!id || !/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new RequestBodyError(400, 'A valid film ID is required.');
        const title = field(form, 'title', 300);
        const description = field(form, 'description', 10_000);
        const year = field(form, 'year', 4);
        const rating = field(form, 'rating', 10);
        const trailer = field(form, 'trailer_key', 11);
        const category = field(form, 'categories', 150);
        const director = field(form, 'director', 500);
        if (title !== undefined && !title.trim()) throw new RequestBodyError(400, 'A film title is required.');
        if (year && !/^\d{4}$/.test(year)) throw new RequestBodyError(400, 'Enter a four-digit year.');
        if (rating && (!Number.isFinite(Number(rating)) || Number(rating) < 0 || Number(rating) > 10)) throw new RequestBodyError(400, 'Rating must be between 0 and 10.');
        if (trailer && !/^[A-Za-z0-9_-]{11}$/.test(trailer)) throw new RequestBodyError(400, 'Enter a valid YouTube video ID.');

        const supabase = createPrivilegedClient();
        const updatePayload: Record<string, unknown> = {};
        if (title !== undefined) updatePayload.title = title;
        if (description !== undefined) updatePayload.description = description;
        if (year !== undefined) updatePayload.year = year;
        if (rating !== undefined) updatePayload.rating = rating;
        if (trailer !== undefined) updatePayload.trailer_key = trailer;
        if (category !== undefined) updatePayload.categories = category ? [category] : [];
        if (director !== undefined) updatePayload.director = director;

        const poster = form.get('poster');
        if (poster !== null) {
            if (!(poster instanceof File) || poster.size < 1 || poster.size > MAX_IMAGE_BYTES) throw new RequestBodyError(400, 'Choose a JPG or PNG image under 2MB.');
            const image = new Uint8Array(await poster.arrayBuffer());
            const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => image[i] === byte);
            const jpg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
            if ((!png || poster.type !== 'image/png') && (!jpg || poster.type !== 'image/jpeg')) throw new RequestBodyError(400, 'Choose a valid JPG or PNG image.');
            const filename = `${user.id}/film-${id}/${randomUUID()}.${png ? 'png' : 'jpg'}`;
            // The bucket is provisioned by reviewed setup, never by a visitor request.
            const { error } = await supabase.storage.from('razinflix_posters').upload(filename, image, {
                contentType: png ? 'image/png' : 'image/jpeg', upsert: false,
            });
            if (error) return NextResponse.json({ error: 'The image could not be saved. Your changes are still available to retry.' }, { status: 503, headers: PRIVATE_HEADERS });
            updatePayload.poster = supabase.storage.from('razinflix_posters').getPublicUrl(filename).data.publicUrl;
        }

        if (!Object.keys(updatePayload).length) throw new RequestBodyError(400, 'Choose a field to update.');
        const { data: film, error } = await supabase.from('razinflix_films').update(updatePayload).eq('id', Number(id)).select().single();
        if (error) {
            console.error('RazinFlix update failed', { code: 'DATABASE_WRITE_FAILED' });
            return NextResponse.json({ error: 'The film could not be saved. Please try again.' }, { status: 503, headers: PRIVATE_HEADERS });
        }
        return NextResponse.json({ success: true, film }, { headers: PRIVATE_HEADERS });
    } catch (error: unknown) {
        const failure = permissionErrorResponse(error) || requestBodyErrorResponse(error);
        if (failure) return failure;
        console.error('RazinFlix update failed', { code: 'INTERNAL_ERROR' });
        return NextResponse.json({ error: 'The film could not be saved. Please try again.' }, { status: 500, headers: PRIVATE_HEADERS });
    }
}

export const POST = withRuntimeGuard(handlePOST)
