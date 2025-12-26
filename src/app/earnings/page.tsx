'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import { useUser } from '@/components/providers/UserProvider'

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
        <main className="min-h-screen bg-[#43628c]">
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
                                <div className="w-[50px] h-[50px] rounded-full bg-linear-to-b from-[#5676a2] to-[#6888b3] flex items-center justify-center shadow-lg border border-white/10 text-white font-bold text-lg">
                                    1
                                </div>
                                <span className="text-white text-2xl font-bold tracking-tight">Sign up</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="w-[50px] h-[50px] rounded-full bg-linear-to-b from-[#5676a2] to-[#6888b3] flex items-center justify-center shadow-lg border border-white/10 text-white font-bold text-lg">
                                    2
                                </div>
                                <span className="text-white text-2xl font-bold tracking-tight">Get your friends to sign up</span>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="w-[50px] h-[50px] rounded-full bg-linear-to-b from-[#5676a2] to-[#6888b3] flex items-center justify-center shadow-lg border border-white/10 text-white font-bold text-lg">
                                    3
                                </div>
                                <span className="text-white text-2xl font-bold tracking-tight">Earn money</span>
                            </div>
                        </div>

                        <p className="text-white/80 text-lg font-medium leading-relaxed max-w-md">
                            with a link-in-bio tool that pays you when your followers sign up.
                        </p>

                        {/* Acquisition Component (Homepage Style) */}
                        <div className="relative w-full max-w-[522px] mt-4">
                            {/* Horizontal layout for larger screens (> 820px) */}
                            <div className="hidden min-[821px]:block">
                                <div className="relative w-full h-[54px]">
                                    <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                                        <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />
                                        <div className="absolute inset-0 opacity-40 rounded-[12px]" style={{ backgroundImage: 'url(/siri-gradient.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                        <span className="relative z-10 text-[22px] font-medium text-white/96 shrink-0 pl-4" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>nsso.me/</span>
                                        <input type="text" value={reservedName} onChange={(e) => setReservedName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()} placeholder="yourname" className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }} />
                                        <div className="relative z-10 mr-1.5 shrink-0"><div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}><button onClick={handleClaimIt} className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}><div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" /><div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" /><span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>CLAIM IT</span></button></div></div>
                                        <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                                    </div>
                                </div>
                            </div>
                            {/* Stacked layout for small screens (≤ 820px) */}
                            <div className="min-[821px]:hidden flex flex-col gap-3">
                                <div className="relative w-full h-[54px]">
                                    <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                                        <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />
                                        <div className="absolute inset-0 opacity-40 rounded-[12px]" style={{ backgroundImage: 'url(/siri-gradient.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                                        <span className="relative z-10 text-[20px] font-medium text-white/96 shrink-0 pl-3" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>nsso.me/</span>
                                        <input type="text" value={reservedName} onChange={(e) => setReservedName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()} placeholder="yourname" className="relative z-10 flex-1 bg-transparent border-none outline-none text-[20px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0 pr-3" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }} />
                                        <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                                    </div>
                                </div>
                                <div className="flex justify-center"><div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}><button onClick={handleClaimIt} className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}><div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" /><div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" /><span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>CLAIM IT</span></button></div></div>
                            </div>
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
                                <GlassCard key={i} className="p-2.5 flex flex-col gap-2">
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
                <div className="w-full max-w-[800px] bg-[#6ca5d8]/20 backdrop-blur-xl border border-white/10 rounded-[40px] p-4 lg:p-6 mb-12 shadow-2xl relative">
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
                    <div
                        ref={sliderRef}
                        className={`h-[44px] bg-transparent rounded-full relative overflow-hidden outline-none focus:ring-2 focus:ring-white/30 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
                        {/* Track Background with Recessed Effect */}
                        <div className="absolute inset-0 rounded-full">
                            <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-full" />
                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-full" />
                        </div>

                        {/* Filled Track */}
                        <div
                            className="absolute top-0 bottom-0 left-0 bg-[rgba(255,255,255,0.6)] rounded-full"
                            style={{
                                width: `${sliderValue}%`,
                                boxShadow: '5px 0px 4px 0px rgba(0,0,0,0.18)'
                            }}
                        />

                        {/* Track Inner Shadow */}
                        <div className="absolute inset-0 pointer-events-none rounded-full" style={{
                            boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)'
                        }} />

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
                    </div>
                </div>

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
                        <div className="w-full bg-white/5 rounded-2xl p-8 border border-white/10 backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-white font-bold bg-white/10 px-3 py-1 rounded-full text-sm">
                                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => navigateMonth(-1)}
                                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors cursor-pointer"
                                    >
                                        {'<'}
                                    </button>
                                    <button
                                        onClick={() => navigateMonth(1)}
                                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors cursor-pointer"
                                    >
                                        {'>'}
                                    </button>
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
                                        days.push(
                                            <div
                                                key={day}
                                                className={`w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'bg-white text-black font-bold' :
                                                    isPaymentDay ? 'bg-white/20' : ''
                                                    }`}
                                            >
                                                {day}
                                            </div>
                                        )
                                    }

                                    return days
                                })()}
                            </div>
                        </div>

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
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#4d6c96]/20 to-[#4d6c96]/50" />

                        <div className="relative z-10 space-y-4 mb-16">
                            {[
                                { icon: '/assets/earnings/icon-1.png', user: 'nsso.me/ramin' },
                                { icon: '/assets/earnings/icon-2.png', user: 'nsso.me/troy' },
                                { icon: '/assets/earnings/icon-3.png', user: 'nsso.me/sahar' },
                                { icon: '/assets/earnings/icon-anas.png', user: 'nsso.me/anas' },
                            ].map((n, i) => (
                                <div key={i} className="flex items-center gap-4 bg-white/10 border border-white/10 p-3 rounded-full backdrop-blur-md shadow-lg transform transition-transform hover:scale-105">
                                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                                        <img src={n.icon} alt="User" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-sm">You gained a new user!</div>
                                        <div className="text-[#a0e0ff] text-xs">{n.user} has used your code.</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="relative z-10 text-center">
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
                    {/* Horizontal layout for larger screens (> 400px) */}
                    <div className="hidden min-[400px]:block"><div className="relative w-full h-[54px]">
                        <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                            <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />
                            <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />
                            <div className="absolute inset-0 opacity-40 rounded-[12px]" style={{ backgroundImage: 'url(/siri-gradient.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                            <span className="relative z-10 text-[22px] font-medium text-white/96 shrink-0 pl-4" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>nsso.me/</span>
                            <input type="text" value={reservedName} onChange={(e) => setReservedName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()} placeholder="yourname" className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }} />
                            <div className="relative z-10 mr-1.5 shrink-0"><div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}><button onClick={handleClaimIt} className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}><div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" /><div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" /><span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>CLAIM IT</span></button></div></div>
                            <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                        </div></div></div>
                    {/* Stacked layout for small screens (≤ 400px) */}
                    <div className="min-[400px]:hidden flex flex-col gap-3">
                        <div className="relative w-full h-[54px]"><div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                            <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />
                            <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />
                            <div className="absolute inset-0 opacity-40 rounded-[12px]" style={{ backgroundImage: 'url(/siri-gradient.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                            <span className="relative z-10 text-[20px] font-medium text-white/96 shrink-0 pl-3" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>nsso.me/</span>
                            <input type="text" value={reservedName} onChange={(e) => setReservedName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()} placeholder="yourname" className="relative z-10 flex-1 bg-transparent border-none outline-none text-[20px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0 pr-3" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }} />
                            <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                        </div></div>
                        <div className="flex justify-center"><div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}><button onClick={handleClaimIt} className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]" style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}><div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" /><div className="absolute inset-0 bg-[rgba(128,128,255,0.3)] mix-blend-color-dodge rounded-[12px]" /><span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>CLAIM IT</span></button></div></div>
                    </div>
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
