import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        
        const id = formData.get('id')?.toString();
        const title = formData.get('title')?.toString();
        const description = formData.get('description')?.toString();
        const year = formData.get('year')?.toString();
        const rating = formData.get('rating')?.toString();
        const posterFile = formData.get('poster') as File | null;

        if (!id) return NextResponse.json({ error: 'Film ID is required.' }, { status: 400 });

        let newPosterUrl: string | null = null;
        
        // 1. Process File via Supabase Storage if attached
        if (posterFile && posterFile.size > 0) {
            if (posterFile.size > 2 * 1024 * 1024) {
                return NextResponse.json({ error: 'Image exceeds 2MB limit.' }, { status: 400 });
            }
            if (!['image/jpeg', 'image/png'].includes(posterFile.type)) {
                return NextResponse.json({ error: 'Only JPG and PNG files are allowed.' }, { status: 400 });
            }

            const ext = posterFile.type === 'image/png' ? 'png' : 'jpg';
            const filename = `film-${id}-${Date.now()}.${ext}`;

            // Upload via Service Key
            const { error: uploadError } = await supabase.storage
                .from('razinflix_posters')
                .upload(filename, posterFile, {
                    contentType: posterFile.type,
                    upsert: true
                });

            if (uploadError) {
                console.error('Upload Error:', uploadError);
                return NextResponse.json({ error: 'Failed to upload photo to Supabase Storage.' }, { status: 500 });
            }

            // Retrieve Public URL
            const { data: publicData } = supabase.storage
                .from('razinflix_posters')
                .getPublicUrl(filename);
                
            newPosterUrl = publicData.publicUrl;
        }

        // 2. Update Postgres database
        const updatePayload: any = {};
        if (title !== undefined) updatePayload.title = title;
        if (description !== undefined) updatePayload.description = description;
        if (year !== undefined) updatePayload.year = year;
        if (rating !== undefined) updatePayload.rating = rating;
        if (newPosterUrl) updatePayload.poster = newPosterUrl;

        const { data: updatedFilm, error: updateError } = await supabase
            .from('razinflix_films')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            console.error('Update Error:', updateError);
            return NextResponse.json({ error: 'Failed to update database record.', details: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Database updated successfully.',
            film: updatedFilm 
        });

    } catch (error: any) {
        console.error('RazinFlix API Update Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
