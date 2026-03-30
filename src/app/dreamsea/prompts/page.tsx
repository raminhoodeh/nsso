'use client'

import { useState, useEffect, useCallback } from 'react'
import { Playfair_Display, Inter } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'] })
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600'] })

// Supabase Configuration from index.html
const GATE_PASSWORD = 'azinam'
const SUPABASE_URL = 'https://lttgrqjxuneyzqdapwnz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_duD6qT-0E_oKetylGoMtiQ_9yoOVbJx'
const PROMPTS_TABLE = 'dreamsea_prompts'
const WIKI_TABLE = 'dreamsea_wiki'

const HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
}

// Data Definitions
const PROMPT_DEFS = [
    {
        key: 'title',
        emoji: '📖',
        name: 'Dream Title',
        description: 'Generates a short, evocative title for each dream. It should feel timeless and mythic — like naming a painting in an ancient gallery.',
        order_num: 1,
        content: `You are a poetic dream archivist. Based on the following dream transcript, generate one short, evocative title for this dream.
The title should feel timeless and mythic — as if naming a painting in an ancient gallery.
Return only the title. No punctuation at the end. No explanation.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'subtitle',
        emoji: '✨',
        name: 'Dream Subtitle',
        description: 'Writes one sentence capturing the emotional or symbolic essence of the dream — like a caption beneath a painting, evocative rather than literal.',
        order_num: 2,
        content: `You are a poetic dream archivist. Based on the following dream transcript, write one sentence that captures the emotional or symbolic essence of this dream.
It should read like a caption beneath a painting — evocative, not literal.
Return only the subtitle sentence.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'jungian',
        emoji: '🔮',
        name: 'Jungian Interpretation',
        description: 'Interprets the dream through the lens of Carl Jung — archetypes, shadow material, the Self, and individuation. 2–3 rich paragraphs.',
        order_num: 3,
        content: `You are a Jungian depth psychologist, drawing on the work of Carl Jung, Marie-Louise von Franz, and the tradition of analytical psychology.
Interpret the following dream through the Jungian lens: identify archetypes, shadow material, anima/animus figures, the Self, and the process of individuation.
Consider what the unconscious is communicating and what integration it is calling for.
Write 2–3 paragraphs in a tone that is psychologically rich yet accessible.
Do not mention Dreamsea. Speak directly to the dreamer in second person.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'persian',
        emoji: '🌹',
        name: 'Persian Interpretation',
        description: 'Interprets through Islamic oneiromancy, Ibn Sirin, and Sufi dream philosophy. Reverent, wise, and spiritually grounded.',
        order_num: 4,
        content: `You are a master of Persian dream interpretation, drawing on the traditions of Islamic oneiromancy, the works of Ibn Sirin, and Sufi dream philosophy.
Interpret the following dream through the Persian lens: consider the spiritual significance of symbols, divine guidance, moral lessons, and the soul's journey.
Write 2–3 paragraphs in a tone that is reverent and wise.
Do not mention Dreamsea. Speak directly to the dreamer in second person.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'egyptian',
        emoji: '👁️',
        name: 'Egyptian Interpretation',
        description: 'Interprets through the Chester Beatty Dream Papyrus and sacred tradition of Serapis dream incubation. Ceremonial and mystical in tone.',
        order_num: 5,
        content: `You are a priest of the Egyptian dream temples, versed in the Chester Beatty Dream Papyrus and the sacred tradition of Serapis dream incubation.
Interpret the following dream through the Egyptian lens: consider the gods, the Duat (underworld), the soul's ka and ba, and the symbolic language of ancient Egyptian mythology.
Write 2–3 paragraphs in a tone that is ceremonial and mystical.
Do not mention Dreamsea. Speak directly to the dreamer in second person.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'japanese',
        emoji: '🍃',
        name: 'Japanese Interpretation',
        description: 'Interprets through Zen practice, Shinto dream oracles, and the mugen tradition of Noh theatre. Quiet, contemplative, and poetic.',
        order_num: 6,
        content: `You are a Zen monk and scholar of Japanese dream tradition, drawing on Shinto dream oracles (yume-awase), Buddhist teachings on the unconscious, and the poetic tradition of mugen (dream-vision) in Noh theatre.
Interpret the following dream through the Japanese lens: consider impermanence, the boundary between waking and dreaming, ancestral messages, and nature symbolism.
Write 2–3 paragraphs in a tone that is quiet, contemplative, and poetic.
Do not mention Dreamsea. Speak directly to the dreamer in second person.

Dream transcript:
{TRANSCRIPT}`
    },
    {
        key: 'monthly_theme',
        emoji: '🌊',
        name: 'Monthly Dream Theme',
        description: 'Synthesises all of a user\'s dreams from the past month into one overarching psychological theme. Written in second person, 4 sentences. No {TRANSCRIPT} needed — the app provides all dreams automatically.',
        order_num: 7,
        content: `The following are dream interpretations from the past month for a single individual.
You are a Jungian depth psychologist reviewing this person's unconscious activity.
In exactly 4 sentences, synthesise the overarching psychological theme or recurring pattern that emerges across these dreams.
Write in second person ("You are..."). Be specific and psychologically insightful — not generic or motivational. Reference actual themes from the material.`
    },
    {
        key: 'affirmation',
        emoji: '💫',
        name: 'Daily Affirmation',
        description: 'Appears in the "Repeat this affirmation" section on the You page. Takes the monthly dream theme and distils it into one short, powerful present-tense statement. Maximum 20 words. No {TRANSCRIPT} needed.',
        order_num: 8,
        content: `Based on the following psychological dream theme, write one short, powerful affirmation in the present tense, first person ("I am..." or "I trust...").
It should feel like a direct message from the unconscious — grounded and honest, not a corporate motivational quote. Maximum 20 words.

Theme:
{THEME}`
    },
]

const PHILOSOPHY_DEFS = [
    {
        key: 'jungian', emoji: '🔮', name: 'Jungian',
        defaults: [
            `For Carl Jung, the deepest purpose of human life is individuation — the lifelong process of becoming who you truly are by integrating all parts of the psyche: the conscious and the unconscious, the light and the shadow, the personal and the collective. The human being is not finished at birth; we are a work in progress, continuously shaped by our encounters with the unknown dimensions of ourselves. To live with awareness of this process is, for Jung, the highest form of human development.`,
            `Dreams are the royal road to the unconscious. Jung understood them not as disguised wish-fulfilments (as Freud did) but as direct, honest communications from the deeper self. The dream does not lie — it speaks in symbolic language because symbols can carry meanings too rich and complex for rational thought alone. Each dream is an attempt by the psyche to compensate for what the waking ego is ignoring, overvaluing, or failing to integrate. Dreams are how the unconscious talks.`,
            `Jung identified two layers of the unconscious: the personal unconscious, containing forgotten memories, repressed emotions, and unresolved experiences; and the collective unconscious, a deeper shared layer of humanity's accumulated psychological experience. The collective unconscious expresses itself through archetypes — universal patterns and patterns such as the Shadow, the Anima/Animus, the Wise Old Man, the Great Mother, and the Self. When these archetypes appear in dreams, they carry enormous energy and significance.`,
            `Jungian dream interpretation begins with amplification: sitting with the dream's images and asking what they remind you of — personally, culturally, mythologically. Do not rush to explanation. The dream's figures are not just symbols; they are autonomous parts of your own psyche, speaking to you. Ask who or what each figure represents within yourself. Pay particular attention to what unsettles you — this is usually where shadow material lives. Active imagination, journalling, and working with a trained analyst can deepen the process.`,
            `Integration is the heart of Jungian work. A dream understood but not lived is not yet fully received. Integration means finding ways to honour the dream's message in waking life — through creative expression, changed behaviour, ritual, or inner dialogue with the figures that appeared. The goal is not to master the unconscious, but to enter into relationship with it. Over time, this relationship — between ego and Self, between consciousness and depth — becomes the foundation of a life lived from the inside out.`,
        ]
    },
    {
        key: 'persian', emoji: '🌹', name: 'Persian',
        defaults: [
            `In the Persian and broader Islamic mystical tradition, the human being is understood as God's most complete creation — a mirror in which the divine attributes are reflected. The Sufi tradition, drawing on thinkers like Ibn Arabi and Rumi, teaches that the human soul carries the divine trust (amana) — the capacity for consciousness, love, and return to the Source. To live well is to polish that mirror, clearing away the dust of ego and distraction.`,
            `In the Persian tradition, dreams occupy a sacred intermediate realm — the Alam al-Mithal or World of Imagination — that exists between the physical world and the divine. The Prophet Muhammad is recorded as saying that 'a good dream is one of the forty-six parts of prophecy.' True dreams (ru'ya sadiqah) are understood as direct communications from God or the angels, offering guidance, warning, or spiritual insight.`,
            `Persian dream philosophy distinguishes three sources: divine dreams, which come from God and carry spiritual truth; soul dreams, which arise from the dreamer's own preoccupations and desires; and confused dreams, which are mere reflections of daily life. True dreams — those sent by God — often carry a quality of clarity, light, and emotional resonance that distinguishes them from ordinary dreaming.`,
            `In the Persian tradition, dream interpretation is considered a sacred science — ta'bir — approached with humility, prayer, and moral seriousness. Ibn Sirin's encyclopaedia of symbols remains the foundational reference. Key principles: always consider the moral character of the dreamer; the time of the dream matters (pre-dawn dreams are considered most true); symbols can carry their opposite meanings in some contexts.`,
            `In the Persian tradition, a dream's message is integrated through prayer, gratitude, and conscious action. If a dream brings a warning, one engages in acts of charity and protection. If a dream brings glad tidings, one increases in gratitude and worship. The Sufi tradition adds a deeper layer: every dream is an invitation to go inward, to examine the state of the soul, and to align more closely with the divine will.`,
        ]
    },
    {
        key: 'egyptian', emoji: '👁️', name: 'Egyptian',
        defaults: [
            `In ancient Egyptian understanding, the human being is a complex of multiple souls. The ka is the vital life force, the ba is the unique personality that survives death, and the akh is the transfigured, immortal self achieved through a righteous life. To fulfil one's purpose was to live in alignment with Ma'at: to act with justice, honour the gods, care for the living, and prepare the soul for its journey through the Duat after death.`,
            `The ancient Egyptians built some of the world's earliest dream temples — places where priests and seekers would sleep on sacred ground to receive divine visions. Dreams were considered a state in which the ba could travel between the world of the living and the Duat, receiving messages from gods and ancestors. The Chester Beatty Dream Papyrus (c. 1275 BCE) records hundreds of dream symbols and their meanings.`,
            `In Egyptian belief, dreams were sent by the gods — particularly Thoth (god of wisdom and writing), Sekhmet (goddess of healing), and the guardian deity Bes. The sleeping state allowed the barrier between the living world and the Duat to dissolve, enabling the soul to receive transmissions from divine beings and deceased ancestors. A dream sent by a god was distinguished by its vividness and the dreamer's feeling upon waking.`,
            `Egyptian dream interpretation followed a systematic symbolic vocabulary preserved by temple scribes. The Chester Beatty Papyrus reveals a pattern: 'If a man sees himself in a dream doing X — good: it means Y.' Interpretation depended on identifying the primary symbol, understanding its divine association, and reading it against the dreamer's current circumstances. Temple priests, known as Masters of the Secret Things, were the official interpreters.`,
            `The Egyptians took swift ritual action in response to significant dreams. If a dream warned of danger, protective amulets were worn and prayers were offered. If a god appeared with instruction, the dreamer would undertake the prescribed action. The dream was understood as a living communication from an intelligent universe, deserving of a living response. Every dream is an act of sacred correspondence.`,
        ]
    },
    {
        key: 'japanese', emoji: '🍃', name: 'Japanese',
        defaults: [
            `In Japanese philosophical and spiritual tradition — drawing on Shinto, Zen Buddhism, and the poetic tradition — the human being exists to cultivate aware (sensitivity to transience), ma (the sacred quality of space and pause), and mushin (effortless, egoless presence). Human life is understood as an inseparable part of the natural world. The purpose of the human is not domination or achievement, but refinement — the gradual polishing of consciousness through attention and simplicity.`,
            `In Japanese tradition, the boundary between waking and dreaming is considered porous and sacred. The concept of mugen — the dream-vision state — is central to the Noh theatre tradition, where the living encounter the spirits of the dead through dreamlike states. Shinto practice included yume-awase, the sharing and communal interpretation of dreams, and hatsuyume, the significance given to the first dream of the new year.`,
            `In Japanese understanding, dreams arise at the threshold between the self and the spirit world. The kami — divine spirits present in all living things — may communicate through dreams. Deceased ancestors may visit the living in sleep to offer guidance or to seek resolution. And the dreamer's own deepest nature — what Zen calls Buddha-nature — may speak through symbolic imagery unavailable to the rational, busy daytime mind.`,
            `Japanese dream interpretation emphasises receptivity over analysis. Rather than rushing to decode symbols, the tradition invites the dreamer to sit with the dream — to feel it, to notice what arises in the body, to let its emotional weather settle before reaching for meaning. When interpretation is sought, it is done through the lens of the dreamer's current life situation. Symbols are read poetically, not literally.`,
            `In the Japanese tradition, a dream is integrated through quiet action — journalling in the haiku spirit, a walk in nature, a conversation with a trusted elder, or a moment of formal gratitude. The goal is not to extract maximum information from the dream, but to let the dream change the quality of your attention. A dream well-received shifts how you see. This is the deepest form of integration: not just understanding what the dream said, but allowing it to alter how you move through the day.`,
        ]
    },
]

const WIKI_SECTION_TITLES = [
    "What's the purpose of the human?",
    "How do dreams serve the purpose of the human?",
    "Where do dreams come from?",
    "How to interpret a dream",
    "Integrating and applying the message",
];

export default function DreamseaPromptsPage() {
    const [isAuthorized, setIsAuthorized] = useState(false)
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [activeSection, setActiveSection] = useState<'prompts' | 'wiki'>('prompts')
    const [currentPhilosophy, setCurrentPhilosophy] = useState('jungian')
    const [prompts, setPrompts] = useState<any[]>([])
    const [wiki, setWiki] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [isAnatomyOpen, setIsAnatomyOpen] = useState(false)

    // Supabase Loaders
    const loadPrompts = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${PROMPTS_TABLE}?select=*&order=order_num`, { headers: HEADERS })
            if (res.ok) {
                const data = await res.json()
                setPrompts(data)
            }
        } catch (e) {
            console.error('Failed to load prompts', e)
            showToast('⚠️ Could not load saved prompts — showing defaults', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [])

    const loadWiki = useCallback(async () => {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${WIKI_TABLE}?select=*&order=key`, { headers: HEADERS })
            if (res.ok) {
                const data = await res.json()
                setWiki(data)
            }
        } catch (e) {
            console.error('Failed to load wiki', e)
        }
    }, [])

    useEffect(() => {
        if (isAuthorized) {
            loadPrompts()
            loadWiki()
        }
    }, [isAuthorized, loadPrompts, loadWiki])

    const handlePasswordSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        if (password === GATE_PASSWORD) {
            setIsAuthorized(true)
        } else {
            setError('That isn\'t quite right, dear 🌸')
            setPassword('')
            setTimeout(() => setError(''), 3000)
        }
    }

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3800)
    }

    // Save Handlers
    const savePrompts = async () => {
        setIsSaving(true)
        const now = new Date().toISOString()
        let allOk = true

        for (const def of PROMPT_DEFS) {
            const element = document.getElementById(`textarea-${def.key}`) as HTMLTextAreaElement
            if (!element) continue

            try {
                const res = await fetch(`${SUPABASE_URL}/rest/v1/${PROMPTS_TABLE}`, {
                    method: 'POST',
                    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        key: def.key,
                        name: def.name,
                        emoji: def.emoji,
                        description: def.description,
                        order_num: def.order_num,
                        content: element.value,
                        updated_at: now,
                    }),
                })
                if (!res.ok) allOk = false
            } catch {
                allOk = false
            }
        }

        setIsSaving(false)
        if (allOk) {
            showToast('✦ All prompts saved beautifully ✦', 'success')
            loadPrompts()
        } else {
            showToast('⚠️ Some prompts could not be saved. Please try again.', 'error')
        }
    }

    const saveWiki = async () => {
        setIsSaving(true)
        const now = new Date().toISOString()
        let allOk = true

        // Save ALL 4 philosophies
        for (const def of PHILOSOPHY_DEFS) {
            for (let idx = 0; idx < 5; idx++) {
                const dbKey = `${def.key}_${idx}`
                const taId = `wiki-textarea-${def.key}-${idx}`
                const ta = document.getElementById(taId) as HTMLTextAreaElement

                let body
                if (ta) {
                    body = ta.value
                } else {
                    const dbRow = wiki.find(r => r.key === dbKey)
                    body = dbRow ? dbRow.body : def.defaults[idx]
                }

                try {
                    const res = await fetch(`${SUPABASE_URL}/rest/v1/${WIKI_TABLE}`, {
                        method: 'POST',
                        headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                        body: JSON.stringify({
                            key: dbKey,
                            philosophy: def.key,
                            section_idx: idx,
                            title: WIKI_SECTION_TITLES[idx],
                            body: body,
                            updated_at: now,
                        }),
                    })
                    if (!res.ok) allOk = false
                } catch {
                    allOk = false
                }
            }
        }

        setIsSaving(false)
        if (allOk) {
            showToast('✦ Wiki saved beautifully ✦', 'success')
            loadWiki()
        } else {
            showToast('⚠️ Some sections could not be saved.', 'error')
        }
    }

    // Auth Screen
    if (!isAuthorized) {
        return (
            <div className={`fixed inset-0 z-50 flex items-center justify-center bg-[#050810]/95 backdrop-blur-2xl ${inter.className}`}>
                <div className="w-full max-w-[360px] p-10 text-center animate-in fade-in zoom-in duration-500 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-3xl">
                    <span className="block mb-4 text-5xl animate-bounce">🌙</span>
                    <h2 className={`text-2xl mb-2 text-[#C1DCED] ${playfair.className}`}>Dream Prompts</h2>
                    <p className="mb-7 text-sm text-[#8A9AB0]">Enter your passphrase to continue</p>
                    <form onSubmit={handlePasswordSubmit}>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-4 mb-4 text-center bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-[#C1DCED]/40 transition-all tracking-[0.2em]"
                            placeholder="· · · · · · · ·"
                            autoFocus
                        />
                        <button type="submit" className="w-full p-4 bg-[#213E60] border border-[#C1DCED]/20 rounded-xl text-[#C1DCED] font-medium hover:opacity-80 transition-all active:scale-95">
                            Enter the Dream ✦
                        </button>
                    </form>
                    <p className={`mt-3 text-sm text-[#ff8fa3] transition-opacity duration-300 ${error ? 'opacity-100' : 'opacity-0'}`}>
                        {error}
                    </p>
                </div>
            </div>
        )
    }

    // Main Admin UI
    return (
        <main className={`relative z-10 max-w-[1360px] mx-auto pt-24 pb-20 px-6 ${inter.className}`}>
            
            {/* Header */}
            <header className="text-center mb-10 p-10 bg-[#0f2648] border border-white/10 rounded-[40px] shadow-2xl backdrop-blur-md">
                <span className="block mb-3 text-6xl animate-pulse cursor-default">🌙</span>
                <h1 className={`text-4xl md:text-5xl font-semibold text-[#C1DCED] mb-6 tracking-tight ${playfair.className}`}>Dreamsea · Dream Prompts</h1>
                <div className="inline-block py-4 px-10 bg-[#050810]/40 border border-white/10 rounded-full backdrop-blur-xl">
                    <p className={`text-lg italic text-[#C1DCED]/80 ${playfair.className}`}>"A dream is an unopened letter from the divine."</p>
                </div>
            </header>

            <div className="w-16 h-[1px] bg-gradient-to-r from-transparent via-[#C1DCED]/30 to-transparent mx-auto mb-10" />

            {/* Tabs */}
            <div className="flex gap-1.5 p-2 mb-10 bg-[#0f2648] border border-white/10 rounded-2xl shadow-xl">
                <button
                    onClick={() => setActiveSection('prompts')}
                    className={`flex-1 py-3.5 rounded-xl font-semibold transition-all ${activeSection === 'prompts' ? 'bg-[#213E60] border border-[#C1DCED]/20 text-[#C1DCED]' : 'text-[#8A9AB0] hover:text-white'} ${playfair.className}`}
                >
                    ✦ AI Prompts
                </button>
                <button
                    onClick={() => setActiveSection('wiki')}
                    className={`flex-1 py-3.5 rounded-xl font-semibold transition-all ${activeSection === 'wiki' ? 'bg-[#213E60] border border-[#C1DCED]/20 text-[#C1DCED]' : 'text-[#8A9AB0] hover:text-white'} ${playfair.className}`}
                >
                    📖 Dream Wiki
                </button>
            </div>

            {/* SECTION: AI PROMPTS */}
            {activeSection === 'prompts' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="mb-10 p-6 bg-[#0f2648] border border-white/10 rounded-2xl shadow-lg">
                        <p className="text-center text-sm text-[#C1DCED]/90 leading-relaxed">
                            These are the eight voices that interpret every dream.<br />
                            Edit them thoughtfully — your words will reach every dreamer. ✦<br /><br />
                            Where you see <strong className="text-[#C1DCED] font-bold">{"{TRANSCRIPT}"}</strong> below, the actual dream recording will appear.
                        </p>
                    </div>

                    {/* Anatomy Guide */}
                    <div className="mb-12">
                        <button 
                            onClick={() => setIsAnatomyOpen(!isAnatomyOpen)}
                            className="w-full p-6 bg-[#0f2648] border border-white/10 rounded-2xl flex items-center justify-between group hover:border-[#C1DCED]/30 transition-all shadow-lg"
                        >
                            <span className={`text-xl font-semibold text-[#C1DCED] shadow-sm ${playfair.className}`}>✦ How to write a beautiful prompt</span>
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] font-bold text-[#C1DCED] px-4 py-1.5 bg-white/5 border border-white/10 rounded-full tracking-wider">A GUIDE FOR AZIN</span>
                                <span className={`text-[#C1DCED] transition-transform duration-300 ${isAnatomyOpen ? 'rotate-180' : ''}`}>▼</span>
                            </div>
                        </button>
                        
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isAnatomyOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            <div className="pt-4 px-1">
                                <div className="p-8 bg-[#0f2648] border border-white/10 rounded-3xl shadow-xl">
                                    <p className="p-6 bg-[#213E60]/40 border border-white/10 rounded-2xl text-sm leading-relaxed text-[#C1DCED]/90 mb-6">
                                        Every prompt you write is a conversation with an ancient intelligence. The clearer your instructions, the more poetic and precise the response. A great prompt has four parts — think of them as layers of a dream: the deeper you go, the richer the meaning.
                                    </p>
                                    <div className="p-6 bg-[#0a1e3a]/60 border border-[#C1DCED]/15 rounded-2xl mb-6">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-lg">🪄</span>
                                            <span className={`text-base font-semibold text-[#C1DCED] ${playfair.className}`}>Automatic Dream Wiki Integration</span>
                                        </div>
                                        <p className="text-[13px] text-[#C1DCED]/80 leading-relaxed">
                                            <strong className="text-[#C1DCED]">You don&apos;t need to copy anything from the Dream Wiki into your prompts.</strong> Dreamsea does this automatically. When a dream is interpreted, the app pulls the matching philosophy&apos;s Wiki content (e.g. the Jungian Wiki for the Jungian interpretation) and feeds it to the AI behind the scenes. So if you update the Dream Wiki text, those changes will automatically shape future dream interpretations — no extra steps needed.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                                        {[
                                            { n: 1, t: 'Persona', d: 'Who is the AI speaking as? Give it an identity grounded in a tradition, role, or archetype.', e: '"You are a Sufi dream scholar who has studied the dream interpretations of Ibn Arabi for forty years..."'},
                                            { n: 2, t: 'Task', d: 'What exactly should it do? Be precise. One clear verb is worth a hundred vague words.', e: '"Interpret the following dream by identifying the key spiritual symbols and what divine message the soul may be receiving."'},
                                            { n: 3, t: 'Context & Goal', d: 'What are the deeper rules? What should it include, avoid, or pay special attention to?', e: '"Focus on symbols of water, animals, and thresholds. Avoid clinical language. Reference the soul\'s longing for wholeness."'},
                                            { n: 4, t: 'Writing Style', d: 'How should it sound? Warm or ceremonial? Poetic or psychological? This shapes the texture.', e: '"Write 2–3 paragraphs in a tone that is intimate and compassionate. Speak directly to the dreamer in second person."'}
                                        ].map(b => (
                                            <div key={b.n} className="p-6 bg-[#050810]/50 border border-white/10 rounded-2xl hover:border-[#C1DCED]/20 transition-all group">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-[26px] h-[26px] rounded-full bg-[#213E60] border border-[#C1DCED]/20 flex items-center justify-center text-[11px] font-bold text-[#C1DCED]">{b.n}</div>
                                                    <span className={`text-base font-semibold text-[#C1DCED] ${playfair.className}`}>{b.t}</span>
                                                </div>
                                                <p className="text-[13px] text-[#C1DCED]/70 leading-relaxed mb-4">{b.d}</p>
                                                <div className="p-4 bg-white/5 border-l-2 border-[#C1DCED]/30 rounded-r-xl text-[12px] italic text-[#C1DCED]/90 leading-relaxed">
                                                    <span className="block text-[9px] uppercase tracking-widest text-[#C1DCED] font-bold mb-2 opacity-60">Example</span>
                                                    {b.e}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-7 bg-[#050810]/80 border border-[#C1DCED]/20 rounded-2xl">
                                        <h4 className="text-[10px] font-bold text-[#C1DCED]/80 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <span className="w-1 h-1 bg-[#C1DCED] rounded-full animate-pulse"></span>
                                            ✦ THE FINAL ASSEMBLY
                                        </h4>
                                        <p className="text-sm leading-relaxed text-white/95 whitespace-pre-wrap font-medium">
                                            <span className="text-blue-200">You are a Sufi dream scholar, versed in the oneiric philosophy of Ibn Arabi and the mystical poetry of Rumi.</span> <span className="text-indigo-200">Interpret the following dream through the Sufi lens: identify the symbols of divine longing, the stations of the soul (maqamat), and what the heart's unconscious is drawing toward.</span> <span className="text-sky-200">Focus especially on symbols of light, water, and beloved figures. Do not mention Dreamsea. Avoid clinical or psychological language.</span> <span className="text-purple-200">Write 2–3 paragraphs in a tone that is reverent, warm, and slightly poetic. Speak directly to the dreamer.</span>
                                            {'\n\n'}Dream transcript:{'\n'}{"{TRANSCRIPT}"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prompt Cards */}
                    <div className="space-y-6">
                        {PROMPT_DEFS.map((def, idx) => {
                            const dbRow = prompts.find(p => p.key === def.key)
                            const content = dbRow ? dbRow.content : def.content
                            return (
                                <div key={def.key} className="bg-[#0f2648] border border-white/10 rounded-[32px] p-8 pt-7 backdrop-blur-md group hover:border-white/20 transition-all shadow-xl">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-3xl">{def.emoji}</span>
                                        <span className={`text-2xl font-semibold text-[#C1DCED] ${playfair.className}`}>{def.name}</span>
                                    </div>
                                    <p className="text-sm text-[#C1DCED]/70 leading-relaxed mb-6 pl-2">{def.description}</p>
                                    <textarea
                                        id={`textarea-${def.key}`}
                                        defaultValue={content}
                                        className="w-full min-h-[180px] p-6 bg-[#050810]/70 border border-white/10 rounded-2xl text-white/95 text-[15px] leading-relaxed outline-none focus:border-[#C1DCED]/40 transition-all font-mono shadow-inner"
                                        placeholder="Write your beautiful prompt here..."
                                    />
                                    <div className="flex justify-between items-center mt-4 text-[12px] text-[#C1DCED]/50 px-2 font-medium">
                                        <span>
                                            {def.key !== 'monthly_theme' ? <>{'Variable: '}<code>{"{TRANSCRIPT}"}</code></> : 'Context is automated.'}
                                        </span>
                                        <span id={`count-${def.key}`} className="tracking-wide">{content.length} characters</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="text-center mt-14 mb-20">
                        <button
                            onClick={savePrompts}
                            disabled={isSaving}
                            className="inline-flex items-center gap-3 py-4.5 px-14 bg-[#213E60] border border-[#C1DCED]/30 rounded-full text-[#C1DCED] font-bold text-lg hover:bg-[#2a4e76] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-2xl"
                        >
                            {isSaving && <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
                            <span>{isSaving ? 'Saving...' : 'Save All Changes ✦'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* SECTION: DREAM WIKI */}
            {activeSection === 'wiki' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="mb-10 p-6 bg-[#0f2648] border border-white/10 rounded-2xl shadow-lg">
                        <p className="text-center text-sm text-[#C1DCED]/90 leading-relaxed">
                            These are the four Dream Philosophy pages that users explore in the app.<br />
                            Section headings are fixed — only the body text beneath each can be changed. ✦
                        </p>
                        <div className="mt-5 p-5 bg-[#0a1e3a]/60 border border-[#C1DCED]/15 rounded-xl">
                            <p className="text-center text-[13px] text-[#C1DCED]/80 leading-relaxed">
                                🪄 <strong className="text-[#C1DCED]">These Wiki pages do double duty.</strong> Users read them in the app as educational content,
                                and Dreamsea also feeds them to the AI automatically when interpreting dreams. So when you update the text here,
                                you&apos;re also shaping how the AI understands and interprets dreams through each philosophy — no extra work required.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 justify-center mb-10">
                        {PHILOSOPHY_DEFS.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setCurrentPhilosophy(p.key)}
                                className={`px-7 py-3 rounded-full border text-[15px] font-bold transition-all backdrop-blur-md shadow-sm ${currentPhilosophy === p.key ? 'bg-[#213E60] border-[#C1DCED]/40 text-[#C1DCED]' : 'bg-[#050810]/60 border-white/10 text-[#C1DCED]/60 hover:text-white'}`}
                            >
                                {p.emoji} {p.name}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-6">
                        {WIKI_SECTION_TITLES.map((title, idx) => {
                            const phil = PHILOSOPHY_DEFS.find(p => p.key === currentPhilosophy)
                            const dbKey = `${currentPhilosophy}_${idx}`
                            const dbRow = wiki.find(r => r.key === dbKey)
                            const content = dbRow ? dbRow.body : phil?.defaults[idx] || ''
                            
                            return (
                                <div key={idx} className="bg-[#0f2648] border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all shadow-xl backdrop-blur-md">
                                    <div className="text-[10px] font-black text-[#C1DCED]/40 uppercase tracking-[0.2em] mb-2">SECTION {idx + 1} OF 5</div>
                                    <div className={`text-2xl font-semibold text-[#C1DCED] mb-2 ${playfair.className}`}>{title}</div>
                                    <div className="text-[11px] font-medium text-[#C1DCED]/40 mb-5 flex items-center gap-1.5 italic">🔒 Heading is locked · Edit body text below</div>
                                    <textarea
                                        id={`wiki-textarea-${currentPhilosophy}-${idx}`}
                                        defaultValue={content}
                                        className="w-full min-h-[160px] p-6 bg-[#050810]/70 border border-white/10 rounded-2xl text-white/95 text-[15px] leading-relaxed outline-none focus:border-[#C1DCED]/40 transition-all shadow-inner"
                                        placeholder="Write flowing prose here..."
                                    />
                                    <div className="flex justify-between items-center mt-4 text-[12px] text-[#C1DCED]/40 px-2 font-medium">
                                        <span>Write in beautiful, accessible prose. 4–6 sentences.</span>
                                        <span className="tracking-widest">{content.length} characters</span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="text-center mt-14 mb-20">
                        <button
                            onClick={saveWiki}
                            disabled={isSaving}
                            className="inline-flex items-center gap-3 py-4.5 px-14 bg-[#213E60] border border-[#C1DCED]/30 rounded-full text-[#C1DCED] font-bold text-lg hover:bg-[#2a4e76] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-2xl"
                        >
                            {isSaving && <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />}
                            <span>{isSaving ? 'Saving...' : 'Save Wiki Changes ✦'}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="text-center pt-12 border-t border-white/10">
                <span className="block mb-4 text-5xl animate-pulse cursor-default">🌹</span>
                <p className={`text-2xl italic text-black font-medium leading-relaxed ${playfair.className}`}>
                    Thanks dear, <span className="text-black font-bold not-italic">Ramin loves you very much.</span>
                </p>
            </footer>

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[999] px-8 py-3.5 rounded-full backdrop-blur-3xl border animate-in slide-in-from-bottom-10 duration-500 scale-100 ${toast.type === 'success' ? 'bg-[#213E60]/80 border-green-400/30 text-green-300' : 'bg-red-950/80 border-red-500/30 text-red-300'}`}>
                    <p className="text-sm font-medium tracking-wide">{toast.message}</p>
                </div>
            )}

            {/* Mobile Nav Spacer */}
            <div className="h-20 lg:hidden" />
        </main>
    )
}
