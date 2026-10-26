'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { X, ZoomIn } from 'lucide-react'
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
} from '@/components/ui/tahoe-glass'
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
            onOpenChange={handleOpenChange}
            closeOnPointerDownOutside={false}
            aria-labelledby="image-cropper-title"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.055}
            overlayClassName="z-[9999] animate-in fade-in duration-200"
            backdropClassName="bg-black/60"
            className="max-w-xl overflow-hidden border border-white/10 p-0"
        >
            <header className="flex items-center justify-between border-b border-white/10 p-6">
                <h2 id="image-cropper-title" className="text-xl font-bold text-white">Crop Image</h2>
                <TahoeGlassButton
                    onClick={onClose}
                    disabled={busy}
                    aria-label="Close image cropper"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.04}
                    className="p-2"
                    contentClassName="text-white/60 hover:text-white"
                >
                    <X size={24} />
                </TahoeGlassButton>
            </header>

            {/* The crop stage intentionally stays opaque so image bounds are legible. */}
            <div className="relative h-[400px] w-full overflow-hidden bg-black/50">
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

            <div className="space-y-6 p-6">
                <div className="flex items-center gap-4">
                    <ZoomIn aria-hidden="true" size={20} className="text-white/50" />
                    <TahoeGlassField
                        label="Zoom"
                        visuallyHideLabel
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="flex-1"
                        surfaceClassName="px-3 py-3"
                        controlClassName="h-1 cursor-pointer appearance-none rounded-lg bg-white/20 active:bg-white/40"
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

                {error && <p role="alert" className="text-sm text-white/90">{error}</p>}

                <div className="flex gap-4">
                    <TahoeGlassButton
                        onClick={onClose}
                        disabled={busy}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="flex-1 border border-white/15 px-5 py-3"
                        contentClassName="text-white/80"
                    >
                        Cancel
                    </TahoeGlassButton>
                    <TahoeGlassButton
                        onClick={handleSave}
                        disabled={busy || !croppedAreaPixels}
                        tone="light"
                        semanticTint="light"
                        semanticTintOpacity={0.07}
                        className="flex-1 border border-white/20 px-5 py-3"
                        contentClassName="text-white"
                    >
                        {busy ? 'Processing...' : 'Apply Crop'}
                    </TahoeGlassButton>
                </div>
            </div>
        </TahoeGlassDialog>
    )
}
