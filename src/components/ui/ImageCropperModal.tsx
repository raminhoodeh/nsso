'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { ZoomIn } from 'lucide-react'
import {
    TahoeGlassDialog,
    TahoeGlassField,
} from '@/components/ui/tahoe-glass'
import { LightButton, LightCloseButton } from '@/components/ui/LightButton';
import getCroppedImg from '@/lib/canvasUtils'
import { runProfileMediaAttempt } from '@/lib/profile-media-client'

interface ImageCropperModalProps {
    isOpen: boolean
    onClose: () => void
    imageSrc: string
    aspectRatio: number // e.g. 1 or 16/9
    onCropComplete: (croppedBlob: Blob, signal: AbortSignal) => void | Promise<void>
    loading?: boolean
}

export default function ImageCropperModal(props: ImageCropperModalProps) {
    return <ImageCropperContent key={props.imageSrc} {...props} />
}

function ImageCropperContent({
    isOpen,
    onClose,
    imageSrc,
    aspectRatio,
    onCropComplete,
    loading = false
}: ImageCropperModalProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const processingRef = useRef(false)
    const activeAttempt = useRef<AbortController | null>(null)
    const busy = processing || loading
    useEffect(() => () => { activeAttempt.current?.abort() }, [])

    const onCropChange = (crop: { x: number; y: number }) => {
        setCrop(crop)
    }

    const onZoomChange = (zoom: number) => {
        setZoom(zoom)
    }

    const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, [])

    const handleSave = async () => {
        if (!croppedAreaPixels || !imageSrc || processingRef.current || loading) return
        processingRef.current = true
        const controller = new AbortController()
        activeAttempt.current = controller
        setProcessing(true)
        setError(null)
        try {
            await runProfileMediaAttempt(async signal => {
                const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
                if (signal.aborted) return
                if (!croppedImageBlob) throw new Error('empty_crop')
                await onCropComplete(croppedImageBlob, signal)
            }, { signal: controller.signal })
        } catch {
            if (!controller.signal.aborted) setError('The image could not be prepared or its save confirmed. Your crop is still here; check your profile before retrying.')
        } finally {
            if (activeAttempt.current === controller) activeAttempt.current = null
            processingRef.current = false
            setProcessing(false)
        }
    }

    const handleOpenChange = useCallback((open: boolean) => {
        if (!open && !busy && !processingRef.current) onClose()
    }, [onClose, busy])

    return (
        <TahoeGlassDialog
            open={isOpen}
            readingMaterial="white"
            onOpenChange={handleOpenChange}
            closeOnPointerDownOutside={false}
            aria-labelledby="image-cropper-title"
            tone="dark"
            semanticTint="dark"
            semanticTintOpacity={0.055}
            overlayClassName="z-[9999] animate-in fade-in duration-200"
            backdropClassName="bg-black/60"
            className="h-[min(680px,calc(100dvh-2rem))] max-w-xl overflow-hidden border border-white/80 p-0"
            contentClassName="flex h-full min-h-0 flex-col text-slate-950 [text-shadow:none] [color-scheme:light]"
        >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-500/15 px-4 py-2 sm:px-6">
                <h2 id="image-cropper-title" className="text-xl font-bold text-slate-950">Crop Image</h2>
                <LightCloseButton onClick={onClose} disabled={busy} aria-label="Close image cropper" />
            </header>

            {/* The crop stage intentionally stays opaque so image bounds are legible. */}
            <div className="relative min-h-[80px] w-full flex-1 overflow-hidden bg-[#202126]">
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectRatio}
                    onCropChange={onCropChange}
                    onCropComplete={onCropCompleteHandler}
                    onZoomChange={onZoomChange}
                    classes={{
                        containerClassName: 'bg-transparent'
                    }}
                />
            </div>

            <div className="max-h-[50%] shrink-0 space-y-3 overflow-y-auto p-3 sm:p-4">
                <div className="flex items-center gap-4">
                    <ZoomIn aria-hidden="true" size={20} className="text-slate-600" />
                    <TahoeGlassField
                        label="Zoom"
                        visuallyHideLabel
                        tone="dark"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="flex-1"
                        surfaceClassName="px-3 py-1"
                        controlClassName="h-11 cursor-pointer accent-slate-800"
                    >
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            disabled={busy}
                            onChange={(e) => setZoom(Number(e.target.value))}
                        />
                    </TahoeGlassField>
                </div>

                {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}

                <div className="flex gap-4">
                    <LightButton
                        onClick={onClose}
                        disabled={busy}
                        className="min-h-11 flex-1 border border-white/15 px-3 py-2"
                        contentClassName="text-slate-950"
                    >
                        Cancel
                    </LightButton>
                    <LightButton
                        onClick={handleSave}
                        disabled={busy || !croppedAreaPixels}
                        className="min-h-11 flex-1 border border-white/20 px-3 py-2"
                        contentClassName="text-slate-950"
                    >
                        {busy ? 'Processing...' : 'Apply Crop'}
                    </LightButton>
                </div>
            </div>
        </TahoeGlassDialog>
    )
}
