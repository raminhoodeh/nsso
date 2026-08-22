'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, ZoomIn } from 'lucide-react'
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
} from '@/components/ui/tahoe-glass'
import getCroppedImg from '@/lib/canvasUtils'

interface ImageCropperModalProps {
    isOpen: boolean
    onClose: () => void
    imageSrc: string
    aspectRatio: number // e.g. 1 or 16/9
    onCropComplete: (croppedBlob: Blob) => void
    loading?: boolean
}

export default function ImageCropperModal({
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
        if (!croppedAreaPixels || !imageSrc) return
        setProcessing(true)
        try {
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
            if (croppedImageBlob) {
                onCropComplete(croppedImageBlob)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setProcessing(false)
        }
    }

    const handleOpenChange = useCallback((open: boolean) => {
        if (!open) onClose()
    }, [onClose])

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
                            onChange={(e) => setZoom(Number(e.target.value))}
                        />
                    </TahoeGlassField>
                </div>

                <div className="flex gap-4">
                    <TahoeGlassButton
                        onClick={onClose}
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
                        disabled={processing || loading}
                        tone="light"
                        semanticTint="light"
                        semanticTintOpacity={0.07}
                        className="flex-1 border border-white/20 px-5 py-3"
                        contentClassName="text-white"
                    >
                        {processing || loading ? 'Processing...' : 'Apply Crop'}
                    </TahoeGlassButton>
                </div>
            </div>
        </TahoeGlassDialog>
    )
}
