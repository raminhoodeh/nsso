'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import { useUser } from '@/components/providers/UserProvider'
import {
    TahoeGlassButton,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass'

interface ReservationControlProps {
    value: string
    onValueChange: (value: string) => void
    onClaim: () => void
    breakpoint: '400' | '821'
}

function ReservationControl({ value, onValueChange, onClaim, breakpoint }: ReservationControlProps) {
    const desktopClassName = breakpoint === '821' ? 'hidden min-[821px]:block' : 'hidden min-[400px]:block'
    const mobileClassName = breakpoint === '821' ? 'min-[821px]:hidden flex flex-col gap-3' : 'min-[400px]:hidden flex flex-col gap-3'

    const field = (compact: boolean) => (
        <TahoeGlassSurface
            variant="recessed"
            radius={12}
            tone="light"
            className="h-[54px] w-full"
            contentClassName="flex h-full w-full items-center"
        >
            <span
                className={`${compact ? 'pl-3 text-[20px]' : 'pl-4 text-[22px]'} shrink-0 font-medium text-white/96`}
                style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
            >
                nsso.me/
            </span>
            <input
                type="text"
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && onClaim()}
                placeholder="yourname"
                aria-label="Reserve your nsso profile name"
                className={`${compact ? 'pr-3 text-[20px]' : 'text-[22px]'} min-w-0 flex-1 border-none bg-transparent font-medium text-white outline-none placeholder:text-white`}
                style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
            />
            {!compact && (
                <TahoeGlassButton
                    onClick={onClaim}
                    radius={12}
                    className="mr-1.5 h-[42px] w-[133px] shrink-0 px-0 py-0"
                    contentClassName="text-[16px] font-semibold tracking-wide !text-white"
                >
                    CLAIM IT
                </TahoeGlassButton>
            )}
        </TahoeGlassSurface>
    )

    return (
        <>
            <div className={desktopClassName}>{field(false)}</div>
            <div className={mobileClassName}>
                {field(true)}
                <div className="flex justify-center">
                    <TahoeGlassButton
                        onClick={onClaim}
                        radius={12}
                        className="h-[42px] w-[133px] px-0 py-0"
                        contentClassName="text-[16px] font-semibold tracking-wide !text-white"
                    >
                        CLAIM IT
                    </TahoeGlassButton>
                </div>
            </div>
        </>
    )
}

export default function EarningsPage() {
    const router = useRouter()
    const { user } = useUser()
    const [reservedName, setReservedName] = useState('')

    // Calculator State
    const [sliderValue, setSliderValue] = useState(0) // 0 to 100
    // Users scaling: Linearish or Logarithmic? 
    // Min: 10, Max: 100,000. 
    // Linear scale for 0-100 slider:
    // users = 10 + (100000 - 10) * (sliderValue / 100)
    // But let's make it feel nice. Linear is fine.
    const users = Math.round(10 + ((100000 - 10) * (sliderValue / 100)))
    const earnings = Math.round(users * 3) // Based on 10 users -> £30

    // Calendar State
    const [currentDate, setCurrentDate] = useState(new Date())
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        return { firstDay, daysInMonth }
    }

    const navigateMonth = (direction: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev)
            newDate.setMonth(prev.getMonth() + direction)
            return newDate
        })
    }

    const handleClaimIt = () => {
        if (user) {
            router.push('/dashboard')
            return
        }

        if (reservedName.trim()) {
            router.push(`/sign-up?name=${encodeURIComponent(reservedName.trim())}`)
        } else {
            router.push('/sign-up')
        }
    }

    // Interactive Slider Logic with throttling
    const sliderRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const rafIdRef = useRef<number | null>(null)

    const updateSlider = useCallback((clientX: number) => {
        // Cancel any pending animation frame
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current)
        }

        // Throttle updates using requestAnimationFrame
        rafIdRef.current = requestAnimationFrame(() => {
            if (!sliderRef.current) return
            const rect = sliderRef.current.getBoundingClientRect()
            const x = clientX - rect.left
            const width = rect.width
            const percentage = Math.min(Math.max((x / width) * 100, 0), 100)
            setSliderValue(percentage)
            rafIdRef.current = null
        })
    }, [])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        updateSlider(e.clientX)
    }, [updateSlider])

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            updateSlider(e.clientX)
        }
    }, [isDragging, updateSlider])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    // Touch support for mobile
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault()
        setIsDragging(true)
        updateSlider(e.touches[0].clientX)
    }, [updateSlider])

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (isDragging && e.touches[0]) {
            e.preventDefault()
            updateSlider(e.touches[0].clientX)
        }
    }, [isDragging, updateSlider])

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false)
    }, [])

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
            setSliderValue(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'ArrowRight') {
            setSliderValue(prev => Math.min(prev + 1, 100))
        }
    }, [])

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove, { passive: false })
            window.addEventListener('mouseup', handleMouseUp)
            window.addEventListener('touchmove', handleTouchMove, { passive: false })
            window.addEventListener('touchend', handleTouchEnd)
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleTouchEnd)

            // Clean up any pending animation frames
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current)
            }
        }
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])


    return (
        <main className="relative z-[1] min-h-screen">
            <Header />

            {/* Section 1: Intro & Acquisition */}
            <section className="pt-[180px] pb-12 px-6 lg:px-[165px] max-w-[1470px] mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_3fr] gap-12 lg:gap-20 items-start">

                    {/* Left Column */}
                    <div className="flex flex-col justify-start gap-8">
                        <div>
                            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
                                Hey, wonderful...
                            </h1>
                        </div>

                        {/* Process List */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-6">
                                <TahoeGlassSurface variant="pill" tone="light" className="h-[50px] w-[50px]" contentClassName="flex h-full w-full items-center justify-center text-lg font-bold">
                                    1
                                </TahoeGlassSurface>
                                <span className="text-white text-2xl font-bold tracking-tight">Sign up</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <TahoeGlassSurface variant="pill" tone="light" className="h-[50px] w-[50px]" contentClassName="flex h-full w-full items-center justify-center text-lg font-bold">
                                    2
                                </TahoeGlassSurface>
                                <span className="text-white text-2xl font-bold tracking-tight">Get your friends to sign up</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <TahoeGlassSurface variant="pill" tone="light" className="h-[50px] w-[50px]" contentClassName="flex h-full w-full items-center justify-center text-lg font-bold">
                                    3
                                </TahoeGlassSurface>
                                <span className="text-white text-2xl font-bold tracking-tight">Earn money</span>
                            </div>
                        </div>

                        <p className="text-white/80 text-lg font-medium leading-relaxed max-w-md">
                            with a link-in-bio tool that pays you when your followers sign up.
                        </p>

                        {/* Acquisition Component (Homepage Style) */}
                        <div className="relative w-full max-w-[522px] mt-4">
                            <ReservationControl value={reservedName} onValueChange={setReservedName} onClaim={handleClaimIt} breakpoint="821" />
                        </div>
                    </div>


                    {/* Right Column Grid */}
                    <div className="flex flex-col gap-6 w-full max-w-[420px] md:ml-auto lg:mr-[15%]">
                        <div className="grid grid-cols-2 gap-3 w-full">
                            {[
                                { name: 'Francesca Lorenzini', role: 'AI Artist', img: '/assets/earnings/profile-1.png' },
                                { name: 'Ramin Hoodeh', role: 'Product Manager & Fiction Author', img: '/assets/earnings/profile-2.png' },
                                { name: 'Yure Felipe', role: 'Private Chef & Nutrition Coach', img: '/assets/earnings/profile-3.png' },
                                { name: 'Ayda Ibrahim', role: 'Mental Health Therapist', img: '/assets/earnings/profile-4.png' },
                            ].map((user, i) => (
                                <GlassCard key={i} className="!rounded-[22px] p-2.5 flex flex-col gap-2">
                                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-black/20">
                                        <img src={user.img} alt={user.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="mt-1">
                                        <h4 className="text-white font-bold text-lg leading-tight mb-0.5">{user.name}</h4>
                                        <p className="text-white/60 text-sm leading-tight">{user.role}</p>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                        <p className="text-white/60 text-xs font-medium text-center">Want to appear here? New users are featured on our product homepage!</p>
                    </div>
                </div>
            </section>

            {/* Section 2: Earnings Calculator */}
            <section className="py-24 px-6 lg:px-[165px] max-w-[1470px] mx-auto flex flex-col justify-center items-center text-center">
                <h2 className="text-4xl lg:text-5xl font-bold text-white mb-3">
                    Earn 40% commission every month
                </h2>
                <h3 className="text-2xl lg:text-3xl text-white/70 mb-12">
                    on all your nsso.me users
                </h3>

                {/* Calculator Component */}
                <TahoeGlassSurface variant="panel" radius={40} tone="light" className="mb-12 w-full max-w-[800px]" contentClassName="p-4 lg:p-6">
                    <div className="flex items-center justify-between text-white font-bold px-4 mb-2 select-none">
                        <div className="w-32 text-left">
                            <div className="text-sm opacity-60">Subscribers</div>
                            <div className="text-xl">{users.toLocaleString()}</div>
                        </div>
                        <div className="w-32 text-right">
                            <div className="text-sm opacity-60">Earnings</div>
                            <div className="text-xl">£{earnings.toLocaleString()}/mo</div>
                        </div>
                    </div>

                    {/* Slider Track */}
                    <TahoeGlassSurface
                        variant="recessed"
                        radius="9999px"
                        tone="light"
                        ref={sliderRef}
                        className={`h-[44px] w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        contentClassName="relative h-full w-full"
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                        onKeyDown={handleKeyDown}
                        tabIndex={0}
                        role="slider"
                        aria-valuemin={10}
                        aria-valuemax={100000}
                        aria-valuenow={users}
                        aria-label="Adjust number of subscribers"
                    >
                        {/* Filled Track */}
                        <div
                            className="absolute bottom-0 left-0 top-0 rounded-full bg-white/45"
                            style={{
                                width: `${sliderValue}%`,
                                boxShadow: '5px 0px 4px 0px rgba(0,0,0,0.18)'
                            }}
                        />

                        {/* Knob with Glow */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 h-[44px] flex items-center justify-end px-[10px] pointer-events-none"
                            style={{
                                left: '0',
                                width: `${sliderValue}%`,
                                minWidth: '44px'
                            }}
                        >
                            {/* Colorful gradient glow */}
                            <div
                                className="absolute w-[60px] h-[60px] rounded-full opacity-90"
                                style={{
                                    backgroundImage: 'url(/siri-gradient.png)',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    filter: 'blur(12px)',
                                    transform: 'translate(-18px, -18px)'
                                }}
                            />
                            <div
                                className="w-[24px] h-[24px] bg-white rounded-full shrink-0 relative z-10"
                                style={{
                                    boxShadow: '0px 0px 16px 10px rgba(94,94,94,0.4), 0px 0px 16px 10px rgba(255,255,255,0.2)'
                                }}
                            />
                        </div>
                    </TahoeGlassSurface>
                </TahoeGlassSurface>

                <p className="text-white/60 text-lg max-w-2xl mx-auto leading-relaxed">
                    You no longer need a paid community to earn money from your following. Simply showcase the personal or professional benefits of the nsso link-in-bio tool you use and point them to sign up with your link.
                </p>
            </section>

            {/* Section 3: Features */}
            <section className="py-24 px-6 lg:px-[165px] max-w-[1470px] mx-auto min-h-screen flex flex-col justify-center">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

                    {/* Top Left: Resume */}
                    <GlassCard className="p-0 overflow-hidden relative min-h-[500px] flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <img src="/assets/earnings/feature-resume.png" alt="Resume App" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-10 text-center">
                            <h3 className="text-2xl font-bold text-white mb-2 leading-tight">Your new Resumé, made for social media</h3>
                            <p className="text-white/80 text-base">Boost your domain authority by showcasing your work experiences, qualifications and past projects in a whole new way.</p>
                        </div>
                    </GlassCard>

                    {/* Top Right: Calendar */}
                    <GlassCard className="p-10 flex flex-col justify-between min-h-[500px]">

                        {/* Calendar UI */}
                        <TahoeGlassSurface variant="card" radius={16} tone="light" className="w-full" contentClassName="p-8">
                            <div className="flex items-center justify-between mb-6">
                                <TahoeGlassSurface as="div" variant="pill" tone="light" contentClassName="px-3 py-1 text-sm font-bold">
                                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                                </TahoeGlassSurface>
                                <div className="flex gap-2">
                                    <TahoeGlassButton
                                        onClick={() => navigateMonth(-1)}
                                        aria-label="Previous month"
                                        className="h-8 w-8 px-0 py-0"
                                        contentClassName="!text-white/80"
                                    >
                                        {'<'}
                                    </TahoeGlassButton>
                                    <TahoeGlassButton
                                        onClick={() => navigateMonth(1)}
                                        aria-label="Next month"
                                        className="h-8 w-8 px-0 py-0"
                                        contentClassName="!text-white/80"
                                    >
                                        {'>'}
                                    </TahoeGlassButton>
                                </div>
                            </div>
                            <div className="grid grid-cols-7 gap-2 text-center mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-white/40 text-xs uppercase">{d}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-2 text-center text-white text-sm">
                                {(() => {
                                    const { firstDay, daysInMonth } = getDaysInMonth(currentDate)
                                    const days = []
                                    const today = new Date()
                                    const isCurrentMonth = currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear()

                                    // Add empty cells for days before the first day of the month
                                    for (let i = 0; i < firstDay; i++) {
                                        days.push(<div key={`empty-${i}`} />)
                                    }

                                    // Add the days of the month
                                    for (let day = 1; day <= daysInMonth; day++) {
                                        const isToday = isCurrentMonth && day === today.getDate()
                                        const isPaymentDay = day === 21
                                        if (isToday || isPaymentDay) {
                                            days.push(
                                                <TahoeGlassSurface
                                                    key={day}
                                                    variant="pill"
                                                    tone={isToday ? 'dark' : 'light'}
                                                    semanticTint={isToday ? 'light' : 'none'}
                                                    semanticTintOpacity={isToday ? 0.16 : undefined}
                                                    className="h-8 w-8"
                                                    contentClassName={`flex h-full w-full items-center justify-center ${isToday ? 'font-bold' : ''}`}
                                                >
                                                    {day}
                                                </TahoeGlassSurface>
                                            )
                                        } else {
                                            days.push(<div key={day} className="flex h-8 w-8 items-center justify-center">{day}</div>)
                                        }
                                    }

                                    return days
                                })()}
                            </div>
                        </TahoeGlassSurface>

                        <div className="mt-8 text-center">
                            <h3 className="text-2xl font-bold text-white mb-2">Payments handled for you</h3>
                            <p className="text-white/80 text-base">Track your earnings and upcoming payments with our interactive calendar. Set reminders and never miss a payment!</p>
                        </div>
                    </GlassCard>

                    {/* Bottom Left: Feature Layers */}
                    <GlassCard className="p-0 overflow-hidden relative min-h-[500px] flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <img src="/assets/earnings/feature-layers.png" alt="Features" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-10 text-center">
                            <h3 className="text-2xl font-bold text-white mb-2 leading-tight">Get more than a link-in-bio tool</h3>
                            <p className="text-white/80 text-base">nsso unifies your personal and professional self by connecting your skills, interests and experiences, with the products and services you have to offer</p>
                        </div>
                    </GlassCard>

                    {/* Bottom Right: Notifications */}
                    <GlassCard className="p-10 flex flex-col justify-start min-h-[500px] relative overflow-hidden">
                        <div className="space-y-4 mb-16">
                            {[
                                { icon: '/assets/earnings/icon-1.png', user: 'nsso.me/ramin' },
                                { icon: '/assets/earnings/icon-2.png', user: 'nsso.me/troy' },
                                { icon: '/assets/earnings/icon-3.png', user: 'nsso.me/sahar' },
                                { icon: '/assets/earnings/icon-anas.png', user: 'nsso.me/anas' },
                            ].map((n, i) => (
                                <TahoeGlassSurface key={i} variant="pill" tone="light" className="transition-transform hover:scale-105" contentClassName="flex items-center gap-4 p-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                                        <img src={n.icon} alt="User" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-sm">You gained a new user!</div>
                                        <div className="text-[#a0e0ff] text-xs">{n.user} has used your code.</div>
                                    </div>
                                </TahoeGlassSurface>
                            ))}
                        </div>

                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-white mb-2">Live updates on new subscribers</h3>
                            <p className="text-white/80 text-base">See who made their nsso profile from your unique link</p>
                        </div>
                    </GlassCard>
                </div>
            </section>

            {/* Footer CTA */}
            <section className="pt-16 pb-24 px-6 text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">Reserve your nsso profile name</h2>
                <p className="text-white/60 text-xl mb-12">and discover a new monetisation avenue as a creator</p>

                {/* Acquisition Component (Repeated) */}
                <div className="relative w-full max-w-[522px] mx-auto mb-12">
                    <ReservationControl value={reservedName} onValueChange={setReservedName} onClaim={handleClaimIt} breakpoint="400" />
                </div>

                <div className="text-center text-white/70 italic text-sm">
                    Message us on{' '}
                    <a href="https://www.instagram.com/ramin.nsso" target="_blank" rel="noopener noreferrer" className="text-white underline hover:no-underline">Instagram</a>
                    {' '}or{' '}
                    <a href="https://wa.link/gh1dhy" target="_blank" rel="noopener noreferrer" className="text-white underline hover:no-underline">WhatsApp</a>
                </div>
            </section>
        </main>
    )
}
