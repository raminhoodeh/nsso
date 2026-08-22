import { Playfair_Display, Inter } from 'next/font/google'
import type { Metadata } from 'next'
import {
  TahoeGlassProvider,
  TahoeGlassSurface,
  type TahoeGlassWebGLSource,
} from '@/components/ui/tahoe-glass'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'] })
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500'] })

export const metadata: Metadata = {
  title: 'Privacy Policy — Dreamsea',
  description: 'Dreamsea privacy policy. We collect minimal data, never sell it, and your dream data belongs only to you.',
}

const sections = [
  {
    emoji: '📦',
    title: 'Data We Collect',
    body: 'Dreamsea collects your dream audio recordings, AI-generated interpretations, and account information (email address or Apple ID). Audio recordings are stored locally on your device and deleted from our servers immediately after transcription.',
  },
  {
    emoji: '🔮',
    title: 'How We Use Your Data',
    body: 'Your dream recordings are processed by Google Gemini AI solely to generate interpretations. We do not sell, share, or use your personal data for advertising. Your dream data belongs to you.',
  },
  {
    emoji: '🔒',
    title: 'Data Storage',
    body: 'Dream interpretations and metadata are stored securely in our Supabase database with row-level security — only you can see your own data. Audio files are stored locally on your device only.',
  },
  {
    emoji: '✦',
    title: 'Your Rights',
    body: 'You may delete your account and all associated data at any time from within the app. Once your dreams are deleted in the app, all data is permanently removed from our database. You can also "Share" your dream interpretations or screenshot them to save them offline before deletion.',
  },
  {
    emoji: '📬',
    title: 'Contact',
    body: 'For any privacy concerns, data requests, or questions, please contact our founder directly at raminhoodeh@gmail.com. We will respond within 48 hours.',
  },
]

function createDreamseaStarsSvg(): string {
  const stars = Array.from({ length: 56 }, (_, index) => {
    const x = Math.abs(Math.cos(index * 137.5)) * 1920
    const y = Math.abs(Math.sin(index * 137.5)) * 1080
    const radius = index % 5 === 0 ? 1.9 : index % 3 === 0 ? 1.25 : 0.8
    const opacity = 0.34 + (index % 4) * 0.14

    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius}" fill="#c1dced" opacity="${opacity.toFixed(2)}"/>`
  }).join('')

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">',
    '<defs>',
    '<linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050810"/><stop offset="0.47" stop-color="#0a1628"/><stop offset="1" stop-color="#050810"/></linearGradient>',
    '<radialGradient id="dream" cx="50%" cy="42%" r="72%"><stop offset="0" stop-color="#17345c" stop-opacity="0.62"/><stop offset="0.48" stop-color="#0c1d36" stop-opacity="0.36"/><stop offset="1" stop-color="#050810" stop-opacity="0"/></radialGradient>',
    '</defs>',
    '<rect width="1920" height="1080" fill="url(#night)"/>',
    '<rect width="1920" height="1080" fill="url(#dream)"/>',
    stars,
    '</svg>',
  ].join('')
}

/**
 * One self-contained, CORS-safe scene source drives both the visible DOM scene
 * and the WebGL sampler. This keeps Safari refraction optically honest instead
 * of asking WebGL to approximate an unrelated CSS background.
 */
const DREAMSEA_STARS_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createDreamseaStarsSvg())}`

const DREAMSEA_STARS_WEBGL_SOURCE = {
  kind: 'image',
  src: DREAMSEA_STARS_IMAGE,
  fit: 'cover',
  label: 'dreamsea-stars',
} satisfies TahoeGlassWebGLSource

export default function DreamseaPrivacyPage() {
  return (
    <TahoeGlassProvider
      scene={(
        <div
          className="absolute inset-0 h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url("${DREAMSEA_STARS_IMAGE}")` }}
        />
      )}
      webglSource={DREAMSEA_STARS_WEBGL_SOURCE}
      sourceLabel="dreamsea-stars"
      preferredBackend="auto"
      fallback="webgl"
      className={`${inter.className} min-h-screen`}
      contentClassName="min-h-screen px-6 pb-24 pt-20"
    >
      <main className="relative z-10 mx-auto w-full max-w-[680px]">
        <header className="mb-12 text-center">
          <span className="mb-4 block text-[3.5rem]">🌙</span>
          <h1
            className={playfair.className}
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.75rem)',
              fontWeight: 600,
              color: '#C1DCED',
              margin: 0,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            Dreamsea
          </h1>
          <p
            className={playfair.className}
            style={{
              fontStyle: 'italic',
              color: 'rgba(193,220,237,0.55)',
              fontSize: '1.05rem',
              marginTop: '0.4rem',
            }}
          >
            Privacy Policy
          </p>
        </header>

        <TahoeGlassSurface
          as="article"
          variant="panel"
          radius={32}
          tone="light"
          semanticTint="dark"
          semanticTintOpacity={0.07}
          className="border border-white/[0.08]"
          style={{ padding: 'clamp(2rem, 6vw, 3rem)' }}
        >
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(193,220,237,0.48)',
              marginBottom: '2rem',
            }}
          >
            Last Updated · April 2026
          </p>

          <p
            style={{
              fontSize: '1rem',
              lineHeight: 1.75,
              color: 'rgba(193,220,237,0.82)',
              marginBottom: '2.5rem',
              paddingBottom: '2.5rem',
              borderBottom: '1px solid rgba(255,255,255,0.09)',
            }}
          >
            Dreamsea is a personal dream journal and AI interpretation app. We are committed to protecting your privacy. This policy explains exactly what we collect, how we use it, and the rights you have over your data.
          </p>

          <div className="flex flex-col gap-9">
            {sections.map((section, index) => (
              <section key={section.title}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="text-lg">{section.emoji}</span>
                  <h2
                    className={playfair.className}
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 600,
                      color: '#C1DCED',
                      margin: 0,
                    }}
                  >
                    {section.title}
                  </h2>
                </div>
                <p
                  style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.8,
                    color: 'rgba(193,220,237,0.7)',
                    margin: 0,
                    paddingLeft: '1.75rem',
                  }}
                >
                  {section.body}
                </p>
                {index < sections.length - 1 && (
                  <div
                    aria-hidden="true"
                    style={{
                      height: 1,
                      background: 'linear-gradient(90deg, transparent, rgba(193,220,237,0.12), transparent)',
                      marginTop: '2.25rem',
                    }}
                  />
                )}
              </section>
            ))}
          </div>

          <TahoeGlassSurface
            as="aside"
            variant="recessed"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.055}
            className="mt-11 border border-[#C1DCED]/10 px-6 py-5"
          >
            <p className="m-0 text-[0.8rem] leading-[1.7] text-[#C1DCED]/55">
              By using Dreamsea, you agree to this Privacy Policy. We may update this policy periodically; continued use of the app constitutes acceptance of any changes. This policy applies to the Dreamsea iOS application.
            </p>
          </TahoeGlassSurface>
        </TahoeGlassSurface>

        <p className="mt-10 text-center text-[0.78rem] tracking-[0.08em] text-[#C1DCED]/30">
          © {new Date().getFullYear()} Dreamsea · Made with ✦ by Ramin
        </p>
      </main>
    </TahoeGlassProvider>
  )
}
