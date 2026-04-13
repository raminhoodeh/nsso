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

        // 2. Initialize Supabase Client
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
            trailer_key: '', 
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

        return NextResponse.json(data);
    } catch (e: any) {
        console.error('Add Film API Error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
