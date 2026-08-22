'use client'

import {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type ButtonHTMLAttributes,
    type CSSProperties,
    type HTMLAttributes,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type Ref
} from 'react'
import { cn } from '@/lib/utils'
import { setGlassLight, useGlassEnvironment } from '@/components/providers/GlassEnvironmentProvider'
import {
    registerGlassSurface,
    type GlassBackendId,
    type GlassSurfaceMaterial
} from '@/lib/glass/surface-registry'

export type GlassSurfaceVariant = 'lens' | 'panel' | 'recessed' | 'nav'
export type GlassSurfaceTone = 'subtle' | 'regular' | 'strong'
export type GlassSurfacePalette = 'dark' | 'light'
export type GlassSurfaceElement = 'div' | 'section' | 'article' | 'aside' | 'nav' | 'header' | 'footer' | 'button'

type NativeButtonProps = Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'disabled' | 'type' | 'name' | 'value' | 'form' | 'autoFocus'
>

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement>, NativeButtonProps {
    as?: GlassSurfaceElement
    variant?: GlassSurfaceVariant
    tone?: GlassSurfaceTone
    palette?: GlassSurfacePalette
    backendId?: GlassBackendId
    interactive?: boolean
    distortionScale?: number
    radius?: string
    contentClassName?: string
    children?: ReactNode
}

type GlassStyle = CSSProperties & Record<`--glass-${string}`, string | number | undefined>

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (typeof ref === 'function') ref(value)
    else if (ref) ref.current = value
}

function parseRadius(radius: string) {
    const parsed = Number.parseFloat(radius)
    return Number.isFinite(parsed) ? parsed : 40
}

function materialFor(
    variant: GlassSurfaceVariant,
    backendId: GlassBackendId,
    radius: string,
    distortionScale?: number
): GlassSurfaceMaterial {
    const recipe = {
        lens: { distortion: 22, dispersion: 0.075, blur: 3.5 },
        panel: { distortion: 10, dispersion: 0.035, blur: 11 },
        nav: { distortion: 7, dispersion: 0.025, blur: 8 },
        recessed: { distortion: 4, dispersion: 0.018, blur: 5 }
    }[variant]

    return {
        backendId,
        variant,
        radius: parseRadius(radius),
        distortion: distortionScale ?? recipe.distortion,
        dispersion: recipe.dispersion,
        blur: recipe.blur
    }
}

const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface({
    as = 'div',
    variant = 'panel',
    tone = 'regular',
    palette = 'dark',
    backendId = 'app',
    interactive = false,
    distortionScale,
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
    const { quality, rendererStatus, reducedMotion, registerLight, requestMeasure } = useGlassEnvironment()
    const Component = as
    const ContentElement = as === 'button' ? 'span' : 'div'
    const defaultRadius = variant === 'recessed' ? '20px' : variant === 'nav' ? '0px' : '40px'
    const resolvedRadius = radius ?? defaultRadius
    const material = useMemo(
        () => materialFor(variant, backendId, resolvedRadius, distortionScale),
        [variant, backendId, resolvedRadius, distortionScale]
    )

    const setElementRef = useCallback((element: HTMLElement | null) => {
        elementRef.current = element
        assignRef(forwardedRef, element)
    }, [forwardedRef])

    useEffect(() => {
        const element = elementRef.current
        if (!element) return
        const unregisterSurface = registerGlassSurface(element, material)
        const unregisterLight = registerLight(element)
        return () => {
            unregisterSurface()
            unregisterLight()
        }
    }, [registerLight, material])

    const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        if (interactive && !reducedMotion) {
            setGlassLight(event.currentTarget, event.clientX, event.clientY)
        }
        requestMeasure()
        onPointerMove?.(event)
    }

    const handlePointerLeave = (event: ReactPointerEvent<HTMLElement>) => {
        requestMeasure()
        onPointerLeave?.(event)
    }

    const mergedStyle: GlassStyle = {
        '--glass-radius': resolvedRadius,
        ...style
    }

    const refractionActive = quality === 'refractive' && (
        backendId === 'places-map' || rendererStatus === 'shared-webgl'
    )

    return (
        <Component
            ref={setElementRef as never}
            className={cn(
                'glass-surface',
                `glass-surface--${variant}`,
                interactive && 'glass-surface--interactive',
                className
            )}
            data-glass-surface="tahoe-v3"
            data-glass-variant={variant}
            data-glass-tone={tone}
            data-glass-palette={palette}
            data-glass-backend={backendId}
            data-glass-refraction={refractionActive ? 'active' : 'fallback'}
            style={mergedStyle}
            onPointerMove={handlePointerMove as never}
            onPointerLeave={handlePointerLeave as never}
            {...props}
        >
            <span className="glass-surface__backdrop" aria-hidden="true" />
            <span className="glass-surface__refraction" aria-hidden="true" />
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
