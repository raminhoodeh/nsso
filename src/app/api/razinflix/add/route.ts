import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        let categories: string[] = ['Uncategorized'];

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
            if (film.genre_ids && film.genre_ids.length > 0) {
                categories = film.genre_ids.map((id: number) => TMDB_GENRES[id]).filter(Boolean);
            }
        } else {
             // Fallback for missing poster heuristic
             poster = "https://via.placeholder.com/300x450?text=" + title.replace(/ /g, '+');
        }

        // 2. Fetch YouTube Trailer
        let trailer_key = '';
        const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
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
