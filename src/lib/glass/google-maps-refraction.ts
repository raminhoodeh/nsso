import { GlassRefractionRenderer } from './refraction-renderer'
import {
    getGlassSurfaceFrames,
    measureGlassSurfaces,
    subscribeGlassSurfaces
} from './surface-registry'

/**
 * Adds the liquid-glass pass directly to Google's vector-map framebuffer.
 * The basemap remains the source of truth; DOM rails and cards sit above the
 * already-refracted pixels produced inside the same WebGL context.
 */
export function attachGoogleMapsRefraction(
    map: google.maps.Map,
    mapElement: HTMLElement
) {
    const overlay = new google.maps.WebGLOverlayView()
    let renderer: GlassRefractionRenderer | null = null
    let removed = false

    overlay.onContextRestored = ({ gl }) => {
        try {
            renderer = new GlassRefractionRenderer(gl)
            document.documentElement.dataset.glassMapRenderer = 'shared-webgl'
        } catch {
            renderer = null
            document.documentElement.dataset.glassMapRenderer = 'native-fallback'
        }
    }

    overlay.onDraw = ({ gl }) => {
        if (!renderer || removed) return
        const mapRect = mapElement.getBoundingClientRect()
        if (mapRect.width <= 0 || mapRect.height <= 0) return

        const frames = getGlassSurfaceFrames(
            'places-map',
            { left: mapRect.left, top: mapRect.top },
            { width: mapRect.width, height: mapRect.height }
        )
        if (!frames.length) return

        try {
            if (!renderer.captureFramebuffer(gl.drawingBufferWidth, gl.drawingBufferHeight)) {
                document.documentElement.dataset.glassMapRenderer = 'native-fallback'
                return
            }
            renderer.render(
                frames,
                { width: mapRect.width, height: mapRect.height },
                { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
                {
                    drawBase: false,
                    sourceWidth: gl.drawingBufferWidth,
                    sourceHeight: gl.drawingBufferHeight
                }
            )
            document.documentElement.dataset.glassMapRenderer = 'shared-webgl'
        } catch {
            document.documentElement.dataset.glassMapRenderer = 'native-fallback'
        }
    }

    overlay.onContextLost = () => {
        renderer = null
        document.documentElement.dataset.glassMapRenderer = 'native-fallback'
    }

    overlay.onRemove = () => {
        renderer?.destroy()
        renderer = null
    }

    const requestMapRedraw = () => {
        measureGlassSurfaces()
        overlay.requestRedraw()
    }
    const unsubscribe = subscribeGlassSurfaces(requestMapRedraw, 'places-map')
    window.addEventListener('resize', requestMapRedraw, { passive: true })
    window.addEventListener('scroll', requestMapRedraw, { passive: true, capture: true })

    overlay.setMap(map)
    requestMapRedraw()

    return () => {
        removed = true
        unsubscribe()
        window.removeEventListener('resize', requestMapRedraw)
        window.removeEventListener('scroll', requestMapRedraw, true)
        overlay.setMap(null)
        delete document.documentElement.dataset.glassMapRenderer
    }
}
