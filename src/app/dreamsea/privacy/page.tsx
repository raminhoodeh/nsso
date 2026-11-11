import { Playfair_Display, Inter } from 'next/font/google'
import type { Metadata } from 'next'
import {
  TahoeGlassProvider,
  TahoeGlassSurface,
  type TahoeGlassWebGLSource,
} from '@/components/ui/tahoe-glass'
import GlobalNavigation from '@/components/layout/GlobalNavigation'
import ConditionalNSSOAgent from '@/components/agent/ConditionalNSSOAgent'
import { ToastViewport } from '@/components/ui/Toast'

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'] })
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500'] })

export const metadata: Metadata = {
  title: 'Dreamsea Privacy Policy',
  description: 'How Dreamsea handles dream content, automated AI processing, technical identifiers, human access, and research into on-device AI.',
}

const sections = [
  {
    "emoji": "🌙",
    "title": "No name or email required",
    "body": "Dreamsea does not ask for your name, email address or a Dreamsea account. A random technical session identifies your installation to protect the AI service and enforce your allowance. Apple handles purchases. Dreamsea does not include advertising, data brokers or behavioural analytics."
  },
  {
    "emoji": "🫧",
    "title": "Automated interpretation and human access",
    "body": "Your dreams are interpreted automatically by AI, not by a human dream interpreter. Dreamsea does not retain a server-side library of recordings, dream text or interpretations for staff to browse, and it does not write that content to its application logs. If you choose to send us a dream or recording for support, we can read or listen to what you provide.\n\nAI processing takes place through Dreamsea's backend and OpenAI. OpenAI's access and retention policies apply, including the possibility of authorised human review for abuse monitoring or legal requirements. Automated interpretation does not mean that no authorised person could ever access submitted content."
  },
  {
    "emoji": "🔎",
    "title": "Identity and technical identifiers",
    "body": "Dreamsea does not attach your name, email address, technical session ID or Apple purchase identifiers to OpenAI requests. The service uses random identifiers to link requests and allowances to an installation, rather than asking who you are. These technical records are pseudonymous, not a guarantee of complete anonymity.\n\nA recording can reveal your voice, and names, places or other personal details you include in a dream can identify you or someone else. Hosting providers also process connection data. We therefore cannot guarantee that a dream could never be associated with a particular person."
  },
  {
    "emoji": "📚",
    "title": "Your library stays on this device",
    "body": "Your dream library, recordings, images, interpretations and saved narration are stored on this device. Dreamsea does not store this content in its server database or sync your library to another device. Library files are excluded from automatic device backups. Use the in-app export tools to keep or share copies. Dreamsea cannot recover a lost reading or restore your library after the app is deleted."
  },
  {
    "emoji": "🔮",
    "title": "OpenAI processing",
    "body": "When you create an AI reading, recordings, dream text and selected saved interpretation text pass over encrypted connections through Dreamsea's backend to OpenAI for transcription, interpretations, images, monthly reflections, affirmations and AI-generated narration.\n\nDreamsea processes this content transiently and does not write it to its server database or application logs. OpenAI does not train on API inputs and outputs by default. Depending on the endpoint, its abuse monitoring logs may retain submitted content for up to 30 days, or longer when legally required or necessary to protect its services or others. Disabling response storage does not guarantee zero provider retention. See OpenAI's API data controls for endpoint-specific retention and access rules.\n\nCreating new AI readings currently requires an internet connection and uses this remote processing. Existing readings, exports and cached narration remain on your device. Deleting a local dream cannot recall content already processed by OpenAI. Older app versions require an update before new OpenAI processing is available."
  },
  {
    "emoji": "✦",
    "title": "Exploring on-device AI",
    "body": "We are exploring on-device AI, including local speech transcription and local language models, to reduce the need to send dream content off your device. We are evaluating the balance between privacy, transcription accuracy, interpretation quality, speed and device limitations.\n\nTranscription turns your speech into text. Interpreting that text is a separate task: Dreamsea currently draws on a custom context database of dream-interpretation philosophy and expert-curated guidance. Our research includes how local models could access that knowledge and preserve the quality and philosophical grounding of readings.\n\nThis work is exploratory, not an on-device feature that is available today or a promise of a release date. Current AI readings still use the remote processing described above."
  },
  {
    "emoji": "🔒",
    "title": "Service metadata and purchases",
    "body": "Dreamsea retains random session and request identifiers, one-way input fingerprints, allowance counts, token usage, cost and verified Apple purchase metadata. These records prevent duplicate charges and enforce spending limits without retaining your dream content. Hosting and AI providers also process technical connection data under their own terms. A completed reading that did not reach your phone cannot be retrieved from Dreamsea's servers."
  },
  {
    "emoji": "✦",
    "title": "Deletion and control",
    "body": "You can delete dreams from your local library at any time. Deleting Dreamsea removes its local library; keep any desired exports first. Deletion does not remove copies you exported or change OpenAI's processing retention. Non-content cost and purchase records remain for service protection."
  },
  {
    "emoji": "📬",
    "title": "Contact",
    "body": "For data requests or privacy questions, contact raminhoodeh@gmail.com."
  }
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
      <GlobalNavigation />
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
            Last Updated · 11 November 2026
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
                    whiteSpace: 'pre-line',
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

          <p className="mt-8 text-sm text-[#C1DCED]/80">
            <a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">OpenAI API data controls</a>
            {' · '}
            <a href="mailto:raminhoodeh@gmail.com" className="underline underline-offset-4">Privacy contact</a>
          </p>

          <TahoeGlassSurface
            as="aside"
            variant="recessed"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.055}
            className="mt-11 border border-[#C1DCED]/10 px-6 py-5"
          >
            <p className="m-0 text-[0.8rem] leading-[1.7] text-[#C1DCED]/55">
              This policy applies to the Dreamsea iOS app. AI readings currently use remote processing; on-device AI remains exploratory.
            </p>
          </TahoeGlassSurface>
        </TahoeGlassSurface>

        <p className="mt-10 text-center text-[0.78rem] tracking-[0.08em] text-[#C1DCED]/30">
          © {new Date().getFullYear()} Dreamsea · Made with ✦ by Ramin
        </p>
      </main>
      <ConditionalNSSOAgent />
      <ToastViewport />
    </TahoeGlassProvider>
  )
}
