'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface ProfileQRCodeToggleProps {
    profilePicUrl: string
    username: string
    fullName: string
    className?: string
}

export default function ProfileQRCodeToggle({
    profilePicUrl,
    username,
    fullName,
    className = ''
}: ProfileQRCodeToggleProps) {
    const [isFlipped, setIsFlipped] = useState(false)

    // Build the profile URL
    // We can confidently use window.location.origin in useEffect or event handlers, 
    // but for SSR safety, we should ideally construct it or use a default.
    // However, since this is a client component and the QR code is generated on the client,
    // we can use window.location.origin if available, or fallback.
    // Better yet, just use `https://nsso.me/${username}` as per requirement.
    const profileUrl = `https://nsso.me/${username}`
    const toggleFlipped = () => setIsFlipped((flipped) => !flipped)

    return (
        <TahoeGlassSurface
            variant="mediaFrame"
            radius={24}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.03}
            role="button"
            tabIndex={0}
            aria-label={isFlipped ? `Show ${fullName}'s profile photo` : `Show ${fullName}'s QR code`}
            aria-pressed={isFlipped}
            className={`relative w-full max-w-[200px] aspect-square mx-auto lg:mx-0 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 ${className}`}
            contentClassName="h-full w-full [perspective:1000px]"
            onClick={toggleFlipped}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                toggleFlipped()
            }}
            title="Click to toggle QR Code"
        >
            <div
                className={`relative w-full h-full transition-all duration-700 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Front: Profile Picture */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden rounded-3xl overflow-hidden shadow-xl"
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={profilePicUrl}
                        alt={fullName}
                        className="w-full h-full object-cover"
                    />

                    {/* Hover Hint */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                        <TahoeGlassSurface
                            variant="pill"
                            tone="light"
                            semanticTint="light"
                            semanticTintOpacity={0.06}
                            className="border border-white/20 px-3 py-1 text-sm font-medium text-white"
                        >
                            Show QR
                        </TahoeGlassSurface>
                    </div>
                </div>


                {/* Back: QR Code */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden rounded-3xl overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.3)] rotate-y-180 flex flex-col items-center justify-center p-4 border border-white/50"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                    }}
                >
                    {/* The white QR plate stays opaque for scanner contrast. */}
                    <div className="bg-white p-2 rounded-xl shadow-inner relative z-10">
                        <QRCodeSVG
                            value={profileUrl}
                            size={120}
                            bgColor={"#ffffff"}
                            fgColor={"#5a769d"} // nsso-bg-primary
                            level={"M"}
                            includeMargin={false}
                        />
                    </div>
                </div>
            </div>

            {/* Inline Styles for Tailwind utilities that might be missing or custom */}
            <style jsx>{`
                .preserve-3d {
                    transform-style: preserve-3d;
                }
                .backface-hidden {
                    backface-visibility: hidden;
                }
                .rotate-y-180 {
                    transform: rotateY(180deg);
                }
            `}</style>
        </TahoeGlassSurface>
    )
}
