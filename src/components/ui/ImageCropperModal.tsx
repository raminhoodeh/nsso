'use client'

import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, Check, ZoomIn } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
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

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <GlassCard className="w-full max-w-xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white">Crop Image</h3>
                    <button
                        onClick={onClose}
                        className="text-white/50 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Cropper Container */}
                <div className="relative w-full h-[400px] bg-black/50 overflow-hidden">
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

                {/* Controls */}
                <div className="p-6 space-y-6">
                    {/* Zoom Slider */}
                    <div className="flex items-center gap-4">
                        <ZoomIn size={20} className="text-white/50" />
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer range-sm active:bg-white/40"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4">
                        <GlassButton
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1"
                        >
                            Cancel
                        </GlassButton>
                        <GlassButton
                            variant="primary"
                            onClick={handleSave}
                            disabled={processing || loading}
                            className="flex-1"
                        >
                            {processing || loading ? 'Processing...' : 'Apply Crop'}
                        </GlassButton>
                    </div>
                </div>
            </GlassCard>
        </div>
    )
}
