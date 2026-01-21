'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { User } from '@supabase/supabase-js'

interface QRScanHandlerProps {
    scannedUserId: string
    currentUser: User | null
}

export default function QRScanHandler({ scannedUserId, currentUser }: QRScanHandlerProps) {
    const searchParams = useSearchParams()
    const { showToast } = useToast()
    const hasProcessed = useRef(false)

    useEffect(() => {
        const source = searchParams.get('source')

        if (source === 'qr' && currentUser && !hasProcessed.current) {
            hasProcessed.current = true // Prevent double fire

            const handleConnection = async () => {
                let locationName = ''

                // 1. Try to get geolocation
                if ('geolocation' in navigator) {
                    try {
                        // Request permission only first time logic is handled by browser
                        // We set a timeout to fail fast if blocked or slow
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                                timeout: 5000,
                                maximumAge: 60000
                            })
                        })

                        // 2. Reverse Geocode (Simple client-side fetch to Nominatim)
                        // Should be moved to server typically, but for V1 speed client is faster here
                        // Or we send coords to API and API resolves name.
                        // Let's send Lat/Long to API ideally? 
                        // But our API expects location_name string currently.
                        // Let's try to resolve name here quickly.

                        const { latitude, longitude } = position.coords
                        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                        if (response.ok) {
                            const data = await response.json()
                            locationName = [
                                data.address.city || data.address.town || data.address.village,
                                data.address.country
                            ].filter(Boolean).join(', ')
                        }
                    } catch (error) {
                        // Permission denied or unavailable, ignore
                        console.warn('Geolocation failed or denied', error)
                    }
                }

                // 3. Create Connection via API
                try {
                    const res = await fetch('/api/my-nsso/connect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            scannedUserId,
                            location: locationName
                        })
                    })

                    if (res.ok) {
                        const data = await res.json()
                        const msg = data.isNewConnection
                            ? `Added ${data.scannedUser?.username || 'user'} to My nsso`
                            : `Updated connection with ${data.scannedUser?.username || 'user'}`

                        showToast(msg, 'success')
                    } else {
                        // silently fail or warn?
                        // If it's self-scan, API returns error 400
                        const errorData = await res.json()
                        if (errorData.error) {
                            showToast(errorData.error, 'error')
                        }
                    }
                } catch (e) {
                    console.error('Connection failed', e)
                }
            }

            handleConnection()
        }
    }, [searchParams, currentUser, scannedUserId, showToast])

    return null // Invisible component
}
