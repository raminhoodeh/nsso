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
                <div
                    className="absolute inset-0 w-full h-full backface-hidden rounded-3xl overflow-hidden shadow-xl rotate-y-180 flex flex-col items-center justify-center p-4 border border-white/30"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    <div className="bg-white p-2 rounded-xl shadow-inner">
                        <QRCodeSVG
                            value={profileUrl}
                            size={120}
                            bgColor={"#ffffff"}
                            fgColor={"#5a769d"} // nsso-bg-primary
                            level={"M"}
                            includeMargin={false}
                        />
                    </div>
                    <p className="mt-3 text-[#5a769d] font-bold text-[10px] tracking-wide text-center leading-tight">
                        All of you. All in one place
                    </p>
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
