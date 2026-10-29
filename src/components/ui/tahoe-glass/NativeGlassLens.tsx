'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { LiquidGlassMaterial } from '@/components/ui/apple-tahoe-liquid-glass-button'
import { useTahoeNativeLens } from './useTahoeNativeLens'
import { SuppliedGlassReadability } from './SuppliedGlassReadability'

type NativeGlassLensOwnProps = {
    as?: React.ElementType
    children?: React.ReactNode
    className?: string
}
export type NativeGlassLensProps<T extends React.ElementType = 'span'> =
    Omit<NativeGlassLensOwnProps, 'as'> & { as?: T } & Omit<React.ComponentPropsWithoutRef<T>, keyof NativeGlassLensOwnProps> & {
        ref?: React.Ref<HTMLElement>
    }

type NativeGlassLensComponent = <T extends React.ElementType = 'span'>(props: NativeGlassLensProps<T>) => React.ReactElement | null

/** A native anchor, label, button or badge using the supplied shared material. */
export const NativeGlassLens = React.forwardRef<HTMLElement, NativeGlassLensOwnProps & React.HTMLAttributes<HTMLElement>>(function NativeGlassLens(
    { as: Component = 'span', className, children, ...props }, ref,
) {
    const lens = useTahoeNativeLens(ref)
    return <Component
        {...props}
        ref={lens.ref}
        className={cn(className, lens.enabled && 'nsso-supplied-glass')}
        data-tahoe-native-lens={lens.enabled ? 'supplied' : undefined}
        data-tahoe-native-solid={lens.solid ? 'true' : undefined}
    >
        {lens.enabled && <LiquidGlassMaterial mode={lens.mode} solid={lens.solid} />}
        {lens.enabled && <SuppliedGlassReadability mode={lens.mode} solid={lens.solid} native />}
        {children}
    </Component>
}) as NativeGlassLensComponent
