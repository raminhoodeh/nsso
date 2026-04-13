import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id } = body;

        if (!id) return NextResponse.json({ error: 'Film ID is required.' }, { status: 400 });

        const { error: deleteError } = await supabase
            .from('razinflix_films')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Delete Error:', deleteError);
            return NextResponse.json({ error: 'Failed to delete database record.', details: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Database record deleted successfully.'
        });

    } catch (error: any) {
        console.error('RazinFlix API Delete Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
