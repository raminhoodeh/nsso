/** Keep dark copy legible when the original WebGL coat is fully transparent.
 * This semantic reading layer is separate from the supplied coat and optics.
 */
export function SuppliedGlassReadability({ mode, solid = false, native = false }: {
    mode: 'svg' | 'webgl' | 'blur'
    solid?: boolean
    native?: boolean
}) {
    if (mode !== 'webgl' || solid) return null
    return <span
        aria-hidden="true"
        data-tahoe-control-readability="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ backgroundColor: 'rgb(255 255 255 / 12%)', zIndex: native ? -3 : 1 }}
    />
}
