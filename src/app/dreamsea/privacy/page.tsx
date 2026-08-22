import { Playfair_Display, Inter } from 'next/font/google'
import type { Metadata } from 'next'

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
    body: "You may delete your account and all associated data at any time from within the app. Once your dreams are deleted in the app, all data is permanently removed from our database. You can also \"Share\" your dream interpretations or screenshot them to save them offline before deletion.",
  },
  {
    emoji: '📬',
    title: 'Contact',
    body: 'For any privacy concerns, data requests, or questions, please contact our founder directly at raminhoodeh@gmail.com. We will respond within 48 hours.',
  },
]

export default function DreamseaPrivacyPage() {
  return (
    <div
      className={inter.className}
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #050810 0%, #0a1628 45%, #050810 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '5rem 1.5rem 6rem',
      }}
    >
      {/* Stars decoration */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        {[...Array(40)].map((_, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: i % 5 === 0 ? 2 : 1,
              height: i % 5 === 0 ? 2 : 1,
              borderRadius: '50%',
              background: 'rgba(193,220,237,0.55)',
              top: `${Math.abs(Math.sin(i * 137.5) * 100)}%`,
              left: `${Math.abs(Math.cos(i * 137.5) * 100)}%`,
              opacity: 0.4 + (i % 4) * 0.15,
            }}
          />
        ))}
      </div>

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 680,
        }}
      >
        {/* Logo / App ID */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '1rem' }}>🌙</span>
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
        </div>

        {/* Card */}
        <div
          style={{
            background: 'rgba(15,38,72,0.75)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 32,
            padding: 'clamp(2rem, 6vw, 3rem)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 40px 80px rgba(0,0,0,0.4)',
          }}
        >
          {/* Last Updated */}
          <p
            style={{
              fontSize: '0.78rem',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(193,220,237,0.38)',
              marginBottom: '2rem',
            }}
          >
            Last Updated · April 2026
          </p>

          {/* Intro */}
          <p
            style={{
              fontSize: '1rem',
              lineHeight: 1.75,
              color: 'rgba(193,220,237,0.75)',
              marginBottom: '2.5rem',
              paddingBottom: '2.5rem',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            Dreamsea is a personal dream journal and AI interpretation app. We are committed to protecting your privacy. This policy explains exactly what we collect, how we use it, and the rights you have over your data.
          </p>

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
            {sections.map((s, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '1.15rem' }}>{s.emoji}</span>
                  <h2
                    className={playfair.className}
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 600,
                      color: '#C1DCED',
                      margin: 0,
                    }}
                  >
                    {s.title}
                  </h2>
                </div>
                <p
                  style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.8,
                    color: 'rgba(193,220,237,0.65)',
                    margin: 0,
                    paddingLeft: '1.75rem',
                  }}
                >
                  {s.body}
                </p>
                {i < sections.length - 1 && (
                  <div
                    style={{
                      height: 1,
                      background: 'linear-gradient(90deg, transparent, rgba(193,220,237,0.12), transparent)',
                      marginTop: '2.25rem',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div
            style={{
              marginTop: '2.75rem',
              padding: '1.25rem 1.5rem',
              background: 'rgba(5,8,16,0.5)',
              border: '1px solid rgba(193,220,237,0.1)',
              borderRadius: 16,
            }}
          >
            <p style={{ fontSize: '0.8rem', color: 'rgba(193,220,237,0.45)', margin: 0, lineHeight: 1.7 }}>
              By using Dreamsea, you agree to this Privacy Policy. We may update this policy periodically; continued use of the app constitutes acceptance of any changes. This policy applies to the Dreamsea iOS application.
            </p>
          </div>
        </div>

        {/* Bottom credit */}
        <p
          style={{
            textAlign: 'center',
            marginTop: '2.5rem',
            fontSize: '0.78rem',
            color: 'rgba(193,220,237,0.22)',
            letterSpacing: '0.08em',
          }}
        >
          © {new Date().getFullYear()} Dreamsea · Made with ✦ by Ramin
        </p>
      </main>
    </div>
  )
}
