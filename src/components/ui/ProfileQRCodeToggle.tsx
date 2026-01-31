'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

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

    return (
        <div
            className={`relative w-full max-w-[200px] aspect-square mx-auto lg:mx-0 cursor-pointer group perspective-1000 ${className}`}
            onClick={() => setIsFlipped(!isFlipped)}
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
                    <img
                        src={profilePicUrl}
                        alt={fullName}
                        className="w-full h-full object-cover"
                    />

                    {/* Hover Hint */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white font-medium text-sm px-3 py-1 bg-white/20 backdrop-blur-md rounded-full">
                            Show QR
                        </span>
                    </div>
                </div>


                {/* Back: QR Code */}
                {/* Back: QR Code (Shiny Glass Effect) */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden rounded-3xl overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.3)] rotate-y-180 flex flex-col items-center justify-center p-4 border border-white/50"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Lighten layer */}
                    <div
                        className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(255,255,255,0.06)] mix-blend-lighten"
                        aria-hidden="true"
                    />

                    {/* Color dodge layer */}
                    <div
                        className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(94,94,94,0.18)] mix-blend-color-dodge"
                        aria-hidden="true"
                    />

                    {/* Shimmer Effect */}
                    <div className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] pointer-events-none">
                        <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                    </div>

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
                .perspective-1000 {
                    perspective: 1000px;
                }
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
        </div>
    )
}
