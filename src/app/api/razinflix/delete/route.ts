import { NextResponse } from 'next/server';
import { createPrivilegedClient, permissionErrorResponse, requirePermission } from '@/lib/server/permissions';
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request';

export async function POST(request: Request) {
    try {
        await requirePermission('razinflix:manage', request);
        const body = await readBoundedJson(request);
        const { id } = body;

        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !['string', 'number'].includes(typeof id)) {
            return NextResponse.json({ error: 'A valid film ID is required.' }, { status: 400 });
        }

        const supabase = createPrivilegedClient();
        const { data: deleted, error: deleteError } = await supabase
            .from('razinflix_films')
            .delete()
            .eq('id', Number(id))
            .select('id')
            .maybeSingle();

        if (deleteError) {
            console.error('RazinFlix delete failed', { code: 'DATABASE_WRITE_FAILED' });
            return NextResponse.json({ error: 'The film could not be deleted. Please try again.' }, { status: 500 });
        }
        if (!deleted) return NextResponse.json({ error: 'This film is no longer in the library.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

        return NextResponse.json({ 
            success: true, 
            message: 'Database record deleted successfully.'
        }, { headers: { 'Cache-Control': 'private, no-store' } });

    } catch (error: unknown) {
        const failure = permissionErrorResponse(error) || requestBodyErrorResponse(error);
        if (failure) return failure;
        console.error('RazinFlix delete failed', { code: 'INTERNAL_ERROR' });
        return NextResponse.json({ error: 'The film could not be deleted. Please try again.' }, { status: 500 });
    }
}
