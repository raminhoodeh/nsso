import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TMDB_API_KEY = process.env.TMDB_API_KEY || "dcddb94a3ed73106f5ac8b2a9548c692";

const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

export async function POST(request: Request) {
    try {
        const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const { title, year } = await request.json();

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // 1. Fetch from TMDB
        let tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
        if (year) {
            tmdbUrl += `&primary_release_year=${year}`;
        }
        
        let tmdbData = await fetch(tmdbUrl).then(r => r.json());
        
        // Follow fallback heuristic if no results
        if ((!tmdbData.results || tmdbData.results.length === 0) && year) {
            let nextYear = parseInt(year) + 1;
            tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&primary_release_year=${nextYear}`;
            tmdbData = await fetch(tmdbUrl).then(r => r.json());
            
            if (!tmdbData.results || tmdbData.results.length === 0) {
                 nextYear = parseInt(year) - 1;
                 tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&primary_release_year=${nextYear}`;
                 tmdbData = await fetch(tmdbUrl).then(r => r.json());
            }
        }

        let poster = '';
        let rating = 'N/A';
        let description = 'Anew cinematic journey added manually to the database.';
        let fetchedYear = year || '';
        let categories: string[] = ['Recently Added'];

        if (tmdbData.results && tmdbData.results.length > 0) {
            const film = tmdbData.results[0];
            if (film.poster_path) {
                poster = `https://image.tmdb.org/t/p/w500${film.poster_path}`;
            }
            if (film.vote_average) {
                rating = film.vote_average === 0 ? 'N/A' : film.vote_average.toFixed(1) + '/10';
            }
            if (film.overview) {
                description = film.overview;
            }
            if (film.release_date && !fetchedYear) {
                fetchedYear = film.release_date.split('-')[0];
            }
        } else {
             // Fallback for missing poster heuristic
             poster = "https://via.placeholder.com/300x450?text=" + title.replace(/ /g, '+');
        }

        // 1.5 Generate Atmospheric Description using Gemini 2.5 Flash
        if (GOOGLE_API_KEY) {
            try {
                const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const prompt = `Write a captivating, atmospheric, and emotionally resonant 2-3 sentence cinematic description for the film "${title}" (${fetchedYear}). Use this background context if helpful: "${description}". Do not include the title of the film or the year in your response, just the raw atmospheric description. Do not use quotes, bold text, or introductory text. Return only the description, nothing else.`;
                const result = await model.generateContent(prompt);
                let newDesc = result.response.text().trim();
                if (newDesc.startsWith('"') && newDesc.endsWith('"')) {
                    newDesc = newDesc.slice(1, -1);
                }
                newDesc = newDesc.replace(/\*\*/g, '');
                if (newDesc.length > 10) {
                    description = newDesc;
                }

                // 1.6 Generate RazinFlix-Specific Category using Gemini 2.5 Flash
                const CATEGORIES = [
                    "Critically-Acclaimed Mind-Bending Sci-Fi", "Visually Striking Emotional Dramas",
                    "Gritty Heist & Crime Thrillers", "Suspenseful Psychological Mysteries",
                    "Epic Historical Period Pieces", "Heartfelt Coming-of-Age Tales",
                    "Surreal & Left-of-Center Cinema", "Dark Comedies & Sharp Satire",
                    "Riveting Global Documentaries", "Classic Masterpieces of World Cinema",
                    "Intense Action, War & Adventure", "Prestige Television & Miniseries",
                    "Nostalgic Cult Classics", "Japanese Anime"
                ];

                const catPrompt = `You are an expert film categorization engine bridging subjective aesthetics with cinematic genres.
Select EXACTLY ONE category from the following strict list that best fits this film:
${CATEGORIES.map(c => `- ${c}`).join('\n')}

Film Title: "${title}"
Year: ${fetchedYear}
Description: ${description}

Do not include quotes, brackets, or any conversational text. Return ONLY the exact string from the allowed list above.`;
                
                const catResult = await model.generateContent(catPrompt);
                let newCategory = catResult.response.text().trim();
                if (newCategory.startsWith('- ')) newCategory = newCategory.substring(2);
                if (newCategory.startsWith('"') && newCategory.endsWith('"')) newCategory = newCategory.slice(1, -1);
                
                if (CATEGORIES.includes(newCategory)) {
                    categories = [newCategory];
                } else {
                    const match = CATEGORIES.find(c => newCategory.includes(c) || c.includes(newCategory));
                    if (match) categories = [match];
                }
            } catch (e) {
                console.error("Gemini API Error:", e);
            }
        }

        // 2. Fetch YouTube Trailer
        let trailer_key = '';
        if (GOOGLE_API_KEY) {
            try {
                const ytQuery = encodeURIComponent(`${title} ${fetchedYear} official trailer -review -reaction -full -gameplay`);
                const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${ytQuery}&key=${GOOGLE_API_KEY}`;
                const ytData = await fetch(ytUrl).then(r => r.json());
                if (ytData.items && ytData.items.length > 0) {
                    trailer_key = ytData.items[0].id?.videoId || '';
                }
            } catch (e) {
                console.error("YouTube API Error:", e);
            }
        }

        // 3. Verify Poster with Google Vision API
        let posterVerified = false;
        let visionText = '';
        if (poster && GOOGLE_API_KEY && !poster.includes('via.placeholder.com')) {
            try {
                const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
                const visionPayload = {
                    requests: [{
                        image: { source: { imageUri: poster } },
                        features: [{ type: "TEXT_DETECTION" }]
                    }]
                };
                const visionRes = await fetch(visionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(visionPayload)
                });
                const visionData = await visionRes.json();
                
                if (visionData.responses && visionData.responses[0]?.textAnnotations) {
                    visionText = visionData.responses[0].textAnnotations[0]?.description?.toLowerCase() || '';
                    const titleWords = title.toLowerCase().split(' ').filter((w: string) => w.length > 2);
                    
                    if (titleWords.length === 0) {
                        posterVerified = visionText.includes(title.toLowerCase());
                    } else {
                        // If at least one distinct word from the title is physically rendered on the poster
                        posterVerified = titleWords.some((w: string) => visionText.includes(w));
                    }
                }
            } catch (e) {
                console.error("Vision API Error:", e);
            }
        }

        // 4. Initialize Supabase Client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const newDbEntry = {
            title: title,
            year: fetchedYear || 'Unknown',
            director: 'Unknown',
            rating: rating,
            poster: poster,
            description: description,
            trailer_key: trailer_key, 
            categories: categories
        };

        const { data, error } = await supabase
            .from('razinflix_films')
            .insert(newDbEntry)
            .select()
            .single();

        if (error) {
            console.error('Supabase Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ...data, _posterVerified: posterVerified });
    } catch (e: any) {
        console.error('Add Film API Error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
