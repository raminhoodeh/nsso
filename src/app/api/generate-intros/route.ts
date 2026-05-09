import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// ─────────────────────────────────────────────
// POST /api/generate-intros
// Generates 3 audience-tailored bio variants via Gemini Flash
// and upserts them into profiles.intros_bios
// ─────────────────────────────────────────────
export async function POST() {
    try {
        const supabase = await createClient()

        // 1. Auth guard
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Fetch the user's current bio
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('bio')
            .eq('user_id', authUser.id)
            .single()

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        const bio = profile.bio?.trim()

        // 3. Guard: bio must exist and be meaningful
        if (!bio || bio.length < 20) {
            return NextResponse.json({
                error: 'Please write a bio first (at least 20 characters) before generating Intros.'
            }, { status: 400 })
        }

        // 4. Build the Gemini prompt
        const prompt = `You are a professional bio writer for nsso, a premium personal identity platform.

Your task is to rewrite the following bio for three specific audiences.

Return ONLY a valid JSON object with exactly these three keys: "recruiter", "collaborator", "client".
No markdown. No preamble. No explanation. Just the raw JSON object.

Rules for each bio:
- Stay strictly true to the facts in the original — do not invent credentials, companies, or titles
- Write in first person
- 2–4 sentences maximum
- Tone and emphasis per audience:
  • recruiter: lead with career achievements and professional value; speak their language (skills, impact, results)
  • collaborator: emphasise working style, shared energy, and what it's like to build with you
  • client: focus on outcomes, trust, and what you can specifically do for them

Original bio:
"${bio}"

Respond with only the JSON object. Example shape:
{"recruiter":"...","collaborator":"...","client":"..."}`

        // 5. Call Gemini Flash
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const result = await model.generateContent(prompt)
        const rawText = result.response.text().trim()

        // 6. Parse and validate the response
        let parsed: { recruiter: string; collaborator: string; client: string }
        try {
            // Strip any accidental markdown code fences the model might add
            const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
            parsed = JSON.parse(cleaned)
        } catch {
            console.error('Gemini returned non-JSON response:', rawText)
            return NextResponse.json({
                error: 'Generation failed — unexpected response format. Please try again.'
            }, { status: 500 })
        }

        // Validate all three keys are present and non-empty strings
        const requiredKeys = ['recruiter', 'collaborator', 'client'] as const
        for (const key of requiredKeys) {
            if (typeof parsed[key] !== 'string' || parsed[key].trim().length === 0) {
                console.error(`Gemini response missing or empty key: ${key}`, parsed)
                return NextResponse.json({
                    error: 'Generation failed — incomplete response. Please try again.'
                }, { status: 500 })
            }
        }

        const introsBios = {
            recruiter: parsed.recruiter.trim(),
            collaborator: parsed.collaborator.trim(),
            client: parsed.client.trim(),
        }

        // 7. Upsert into profiles.intros_bios
        const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({
                user_id: authUser.id,
                intros_bios: introsBios,
            })

        if (upsertError) {
            console.error('Failed to save intros_bios:', upsertError)
            return NextResponse.json({ error: 'Failed to save Intros.' }, { status: 500 })
        }

        // 8. Return the 3 variants to the client
        return NextResponse.json(introsBios)

    } catch (error: any) {
        console.error('generate-intros POST error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// ─────────────────────────────────────────────
// PATCH /api/generate-intros
// Saves manual edits to one or more intro bio variants
// Body: { recruiter?, collaborator?, client? }
// Merges with existing — never overwrites keys not sent
// ─────────────────────────────────────────────
export async function PATCH(request: Request) {
    try {
        const supabase = await createClient()

        // 1. Auth guard
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Parse the incoming partial update
        const body = await request.json()
        const { recruiter, collaborator, client } = body

        // At least one key must be present
        if (recruiter === undefined && collaborator === undefined && client === undefined) {
            return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 })
        }

        // 3. Fetch the current intros_bios so we can merge cleanly
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('intros_bios')
            .eq('user_id', authUser.id)
            .single()

        if (profileError || !profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
        }

        // 4. Merge: existing values are preserved for any key not in the update
        const existing = (profile.intros_bios as Record<string, string>) || {}
        const merged = {
            ...existing,
            ...(recruiter !== undefined && { recruiter: recruiter.trim() }),
            ...(collaborator !== undefined && { collaborator: collaborator.trim() }),
            ...(client !== undefined && { client: client.trim() }),
        }

        // 5. Upsert the merged object
        const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({
                user_id: authUser.id,
                intros_bios: merged,
            })

        if (upsertError) {
            console.error('Failed to update intros_bios:', upsertError)
            return NextResponse.json({ error: 'Failed to save changes.' }, { status: 500 })
        }

        // 6. Return the full merged object
        return NextResponse.json(merged)

    } catch (error: any) {
        console.error('generate-intros PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
