'use client'

import Link from 'next/link'
import Script from 'next/script'
import { Cookie } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TahoeGlassButton, TahoeGlassDialog } from '@/components/ui/tahoe-glass'

import {
    META_PIXEL_CONSENT_COOKIE,
    META_PIXEL_CONSENT_MAX_AGE,
    type MetaPixelConsentState,
} from '@/lib/analytics/metaPixel'

interface MetaPixelConsentProps {
    pixelId: string
    initialConsent: MetaPixelConsentState
}

type MetaFbq = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void
    queue?: unknown[][]
    push?: MetaFbq
    loaded?: boolean
    version?: string
}

declare global {
    interface Window {
        fbq?: MetaFbq
        _fbq?: MetaFbq
        __nssoMetaPixelInitialized?: Record<string, boolean>
    }
}

function writeConsentCookie(value: Exclude<MetaPixelConsentState, 'unset'>) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${META_PIXEL_CONSENT_COOKIE}=${value}; Max-Age=${META_PIXEL_CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`
}

function pixelBootstrap(pixelId: string) {
    return `
        !function(f,b,e,v,n,t,s){
            if(f.fbq)return;
            n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;
            n.push=n;
            n.loaded=!0;
            n.version='2.0';
            n.queue=[];
            t=b.createElement(e);
            t.async=!0;
            t.src=v;
            s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)
        }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        window.__nssoMetaPixelInitialized=window.__nssoMetaPixelInitialized||{};
        if(!window.__nssoMetaPixelInitialized['${pixelId}']){
            fbq('init','${pixelId}');
            window.__nssoMetaPixelInitialized['${pixelId}']=true;
        }
    `
}

export default function MetaPixelConsent({
    pixelId,
    initialConsent,
}: MetaPixelConsentProps) {
    const [consent, setConsent] = useState(initialConsent)
    const [preferencesOpen, setPreferencesOpen] = useState(initialConsent === 'unset')
    const pageViewTracked = useRef(false)
    const validPixelId = /^\d{5,25}$/.test(pixelId)

    useEffect(() => {
        const openFromHash = () => {
            if (window.location.hash === '#privacy-choices') setPreferencesOpen(true)
        }

        openFromHash()
        window.addEventListener('hashchange', openFromHash)
        return () => window.removeEventListener('hashchange', openFromHash)
    }, [])

    const trackPageView = useCallback(() => {
        if (pageViewTracked.current || !window.fbq) return
        window.fbq('consent', 'grant')
        window.fbq('track', 'PageView')
        pageViewTracked.current = true
    }, [])

    useEffect(() => {
        if (consent === 'granted') trackPageView()
    }, [consent, trackPageView])

    const chooseConsent = (choice: Exclude<MetaPixelConsentState, 'unset'>) => {
        writeConsentCookie(choice)

        if (choice === 'denied') {
            window.fbq?.('consent', 'revoke')
            pageViewTracked.current = false
        }

        setConsent(choice)
        setPreferencesOpen(false)
        if (window.location.hash === '#privacy-choices') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
    }

    if (!validPixelId) return null

    return (
        <>
            {consent === 'granted' && (
                <>
                    <Script
                        id={`meta-pixel-${pixelId}`}
                        strategy="afterInteractive"
                        onReady={trackPageView}
                        dangerouslySetInnerHTML={{ __html: pixelBootstrap(pixelId) }}
                    />
                    <noscript>
                        {/* Meta's no-JavaScript fallback must remain a direct tracking pixel. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            alt=""
                            height="1"
                            width="1"
                            style={{ display: 'none' }}
                            src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
                        />
                    </noscript>
                </>
            )}

            {preferencesOpen ? (
                <TahoeGlassDialog
                    open={preferencesOpen}
                    onOpenChange={setPreferencesOpen}
                    aria-labelledby="meta-privacy-title"
                    closeOnEscape={false}
                    closeOnPointerDownOutside={false}
                    radius={24}
                    tone="light"
                    overlayClassName="z-[100] items-end justify-center p-4"
                    className="max-w-2xl p-5 text-white sm:p-6"
                >
                    <div className="flex items-start gap-4">
                        <Cookie aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-white/70" />
                        <div className="min-w-0 flex-1">
                            <h2 id="meta-privacy-title" className="text-base font-semibold">
                                Marketing privacy
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-white/70">
                                Ramin&apos;s profile can use Meta Pixel to measure advertising performance. It stays off unless you allow marketing tracking.
                            </p>
                            <Link
                                href="/ramin/privacy"
                                className="mt-2 inline-block text-sm text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                            >
                                Read the tracking notice
                            </Link>
                        </div>
                    </div>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <TahoeGlassButton
                            type="button"
                            onClick={() => chooseConsent('denied')}
                            radius={12}
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.08}
                            className="min-h-11 px-5 py-2.5 text-sm font-medium text-white transition-colors"
                            contentClassName="text-inherit"
                        >
                            Decline
                        </TahoeGlassButton>
                        <TahoeGlassButton
                            type="button"
                            onClick={() => chooseConsent('granted')}
                            radius={12}
                            tone="light"
                            semanticTint="light"
                            semanticTintOpacity={0.12}
                            className="min-h-11 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                            contentClassName="text-inherit"
                        >
                            Allow
                        </TahoeGlassButton>
                    </div>
                </TahoeGlassDialog>
            ) : (
                <TahoeGlassButton
                    type="button"
                    onClick={() => setPreferencesOpen(true)}
                    radius={12}
                    tone="light"
                    className="fixed bottom-4 left-4 z-[90] min-h-10 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:text-white"
                    contentClassName="flex items-center gap-2 text-inherit"
                >
                    <Cookie aria-hidden="true" className="h-4 w-4" />
                    Privacy choices
                </TahoeGlassButton>
            )}
        </>
    )
}
