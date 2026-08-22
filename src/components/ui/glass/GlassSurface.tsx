'use client'

import {
    forwardRef,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type CSSProperties,
    type HTMLAttributes,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type Ref
} from 'react'
import { cn } from '@/lib/utils'
import { setGlassLight, useGlassEnvironment } from '@/components/providers/GlassEnvironmentProvider'
import { createLensDisplacementMap, type LensDisplacementMap } from './lens-map'

export type GlassSurfaceVariant = 'lens' | 'panel' | 'recessed' | 'nav'
export type GlassSurfaceTone = 'subtle' | 'regular' | 'strong'
export type GlassSurfaceElement = 'div' | 'section' | 'article' | 'aside' | 'nav' | 'header' | 'footer' | 'button'

type NativeButtonProps = Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'disabled' | 'type' | 'name' | 'value' | 'form' | 'autoFocus'
>

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement>, NativeButtonProps {
    as?: GlassSurfaceElement
    variant?: GlassSurfaceVariant
    tone?: GlassSurfaceTone
    interactive?: boolean
    distortionScale?: number
    radius?: string
    contentClassName?: string
    children?: ReactNode
}

type GlassStyle = CSSProperties & Record<`--glass-${string}`, string | number | undefined>

interface SurfaceSize {
    width: number
    height: number
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (typeof ref === 'function') {
        ref(value)
    } else if (ref) {
        ref.current = value
    }
}

function useLensMap(
    elementRef: React.RefObject<HTMLElement | null>,
    enabled: boolean
) {
    const [lensMap, setLensMap] = useState<LensDisplacementMap | null>(null)
    const [surfaceSize, setSurfaceSize] = useState<SurfaceSize>({ width: 0, height: 0 })
    const lastSizeKeyRef = useRef('')

    useEffect(() => {
        const element = elementRef.current
        if (!element || !enabled) return

        let frame: number | null = null

        const measure = () => {
            frame = null
            const rect = element.getBoundingClientRect()
            const width = Math.max(0, Math.round(rect.width))
            const height = Math.max(0, Math.round(rect.height))
            if (width === 0 || height === 0) return

            const sizeKey = `${Math.round(width / 8)}x${Math.round(height / 8)}`
            if (sizeKey === lastSizeKeyRef.current) return
            lastSizeKeyRef.current = sizeKey
            setSurfaceSize({ width, height })
            setLensMap(createLensDisplacementMap(width, height))
        }

        const scheduleMeasure = () => {
            if (frame !== null) return
            frame = window.requestAnimationFrame(measure)
        }

        scheduleMeasure()
        const observer = 'ResizeObserver' in window
            ? new ResizeObserver(scheduleMeasure)
            : null
        observer?.observe(element)

        return () => {
            observer?.disconnect()
            if (frame !== null) window.cancelAnimationFrame(frame)
        }
    }, [elementRef, enabled])

    return { lensMap, surfaceSize }
}

const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface({
    as = 'div',
    variant = 'panel',
    tone = 'regular',
    interactive = false,
    distortionScale = 20,
    radius,
    contentClassName,
    className,
    children,
    style,
    onPointerMove,
    onPointerLeave,
    ...props
}, forwardedRef) {
    const elementRef = useRef<HTMLElement | null>(null)
    const { quality, reducedMotion, registerLens, requestMeasure } = useGlassEnvironment()
    const filterId = `glass-lens-${useId().replace(/:/g, '-')}`
    const isLens = variant === 'lens'
    const refractionEnabled = isLens && quality === 'refractive'
    const { lensMap, surfaceSize } = useLensMap(elementRef, refractionEnabled)
    const Component = as
    const ContentElement = as === 'button' ? 'span' : 'div'

    const setElementRef = useCallback((element: HTMLElement | null) => {
        elementRef.current = element
        assignRef(forwardedRef, element)
    }, [forwardedRef])

    useEffect(() => {
        const element = elementRef.current
        if (!element || !isLens) return
        return registerLens(element)
    }, [isLens, registerLens])

    const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        if (isLens && interactive && !reducedMotion) {
            setGlassLight(event.currentTarget, event.clientX, event.clientY)
        }
        onPointerMove?.(event)
    }

    const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
        if (isLens && interactive) requestMeasure()
        onPointerLeave?.(event)
    }

    const defaultRadius = variant === 'recessed' ? '20px' : variant === 'nav' ? '0px' : '40px'
    const overscan = Math.max(8, Math.ceil(distortionScale * 1.25))
    const canRenderFilter = Boolean(lensMap && surfaceSize.width > 0 && surfaceSize.height > 0)
    const mergedStyle: GlassStyle = {
        '--glass-radius': radius ?? defaultRadius,
        '--glass-rim-opacity': lensMap?.rimOpacity ?? 0.62,
        ...style
    }

    return (
        <Component
            ref={setElementRef as never}
            className={cn(
                'glass-surface',
                `glass-surface--${variant}`,
                interactive && 'glass-surface--interactive',
                className
            )}
            data-glass-surface="tahoe-v2"
            data-glass-variant={variant}
            data-glass-tone={tone}
            data-glass-refraction={canRenderFilter ? 'active' : 'fallback'}
            style={mergedStyle}
            onPointerMove={handlePointerMove as never}
            onPointerLeave={handlePointerLeave as never}
            {...props}
        >
            {canRenderFilter && (
                <svg
                    className="glass-surface__filter-definitions"
                    width="0"
                    height="0"
                    aria-hidden="true"
                    focusable="false"
                >
                    <defs>
                        <filter
                            id={filterId}
                            x={-overscan}
                            y={-overscan}
                            width={surfaceSize.width + overscan * 2}
                            height={surfaceSize.height + overscan * 2}
                            filterUnits="userSpaceOnUse"
                            primitiveUnits="userSpaceOnUse"
                            colorInterpolationFilters="sRGB"
                        >
                            <feImage
                                href={lensMap?.url}
                                x="0"
                                y="0"
                                width={surfaceSize.width}
                                height={surfaceSize.height}
                                preserveAspectRatio="none"
                                result="lens-map"
                            />
                            <feDisplacementMap
                                in="SourceGraphic"
                                in2="lens-map"
                                scale={distortionScale}
                                xChannelSelector="R"
                                yChannelSelector="G"
                            />
                        </filter>
                    </defs>
                </svg>
            )}

            <span className="glass-surface__backdrop" aria-hidden="true" />
            {canRenderFilter && (
                <span
                    className="glass-surface__refraction"
                    style={{ filter: `url(#${filterId})` }}
                    aria-hidden="true"
                />
            )}
            <span className="glass-surface__tint" aria-hidden="true" />
            <span className="glass-surface__specular" aria-hidden="true" />
            <span className="glass-surface__rim" aria-hidden="true" />

            <ContentElement className={cn('glass-surface__content', contentClassName)}>
                {children}
            </ContentElement>
        </Component>
    )
})

GlassSurface.displayName = 'GlassSurface'

export default GlassSurface
