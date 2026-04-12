import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

        // 1. Process File if attached
        let newPosterUrl: string | null = null;
        if (posterFile && posterFile.size > 0) {
            // Guardrail: Max 2MB
            if (posterFile.size > 2 * 1024 * 1024) {
                return NextResponse.json({ error: 'Image exceeds 2MB limit.' }, { status: 400 });
            }
            // Guardrail: JPG/PNG only
            if (!['image/jpeg', 'image/png'].includes(posterFile.type)) {
                return NextResponse.json({ error: 'Only JPG and PNG files are allowed.' }, { status: 400 });
            }

            const buffer = Buffer.from(await posterFile.arrayBuffer());
            const ext = posterFile.type === 'image/png' ? 'png' : 'jpg';
            const filename = `film-${id}-${Date.now()}.${ext}`;

            // Create dir if doesn't exist
            const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'razinflix');
            await fs.mkdir(uploadDir, { recursive: true });

            const filePath = path.join(uploadDir, filename);
            await fs.writeFile(filePath, buffer);

            newPosterUrl = `/uploads/razinflix/${filename}`;
        }

        // 2. Update physical JSON database
        const jsonPath = path.join(process.cwd(), 'src', 'data', 'films.json');
        const jsonRaw = await fs.readFile(jsonPath, 'utf8');
        const films = JSON.parse(jsonRaw);

        const filmIndex = films.findIndex((f: any) => f.id.toString() === id);
        if (filmIndex === -1) {
            return NextResponse.json({ error: 'Film not found.' }, { status: 404 });
        }

        // Apply mutations
        if (title !== undefined) films[filmIndex].title = title;
        if (description !== undefined) films[filmIndex].description = description;
        if (year !== undefined) films[filmIndex].year = year;
        if (rating !== undefined) films[filmIndex].rating = rating;
        if (newPosterUrl) films[filmIndex].poster = newPosterUrl;

        // Save back
        await fs.writeFile(jsonPath, JSON.stringify(films, null, 2));

        return NextResponse.json({ 
            success: true, 
            message: 'Database updated locally.',
            film: films[filmIndex] 
        });

    } catch (error: any) {
        console.error('RazinFlix API Update Error:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}
