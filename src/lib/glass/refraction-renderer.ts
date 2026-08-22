export interface RefractionSurfaceFrame {
    left: number
    top: number
    width: number
    height: number
    radius: number
    distortion: number
    dispersion: number
    blur: number
}

interface RendererOptions {
    drawBase: boolean
    sourceWidth: number
    sourceHeight: number
}

interface SavedGlState {
    program: WebGLProgram | null
    framebuffer: WebGLFramebuffer | null
    drawFramebuffer: WebGLFramebuffer | null
    readFramebuffer: WebGLFramebuffer | null
    arrayBuffer: WebGLBuffer | null
    elementArrayBuffer: WebGLBuffer | null
    vertexArray: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null
    activeTexture: number
    activeTextureBinding: WebGLTexture | null
    texture0Binding: WebGLTexture | null
    viewport: Int32Array
    scissorBox: Int32Array
    colorMask: [boolean, boolean, boolean, boolean]
    depthMask: boolean
    stencilMaskFront: number
    stencilMaskBack: number
    blend: boolean
    depthTest: boolean
    cullFace: boolean
    scissorTest: boolean
    stencilTest: boolean
    polygonOffsetFill: boolean
    sampleAlphaToCoverage: boolean
    sampleCoverage: boolean
    vertexAttrib: SavedVertexAttribState | null
}

interface SavedVertexAttribState {
    location: number
    enabled: boolean
    buffer: WebGLBuffer | null
    size: number
    type: number
    normalized: boolean
    stride: number
    offset: number
    current: Float32Array
}

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_scene;
uniform vec2 u_viewport_css;
uniform vec2 u_output_px;
uniform float u_source_aspect;
uniform float u_mode;
uniform vec4 u_rect_css;
uniform float u_radius_css;
uniform float u_distortion_css;
uniform float u_dispersion;
uniform float u_blur_css;

varying vec2 v_uv;

vec2 coverUv(vec2 uv) {
    float viewportAspect = u_viewport_css.x / max(1.0, u_viewport_css.y);
    vec2 fitted = uv;

    if (u_source_aspect > viewportAspect) {
        float scale = viewportAspect / u_source_aspect;
        fitted.x = (uv.x - 0.5) * scale + 0.5;
    } else {
        float scale = u_source_aspect / viewportAspect;
        fitted.y = (uv.y - 0.5) * scale + 0.5;
    }

    return clamp(fitted, vec2(0.001), vec2(0.999));
}

vec3 sampleScene(vec2 uv, vec2 delta, float blurPx) {
    vec2 viewportUv = vec2(
        1.0 / max(1.0, u_viewport_css.x),
        1.0 / max(1.0, u_viewport_css.y)
    );
    vec2 blurStep = viewportUv * blurPx * 0.48;
    float spread = u_dispersion;

    vec2 redUv = uv + delta * (1.0 + spread);
    vec2 greenUv = uv + delta;
    vec2 blueUv = uv + delta * (1.0 - spread);
    vec3 sharp = vec3(
        texture2D(u_scene, coverUv(redUv)).r,
        texture2D(u_scene, coverUv(greenUv)).g,
        texture2D(u_scene, coverUv(blueUv)).b
    );

    if (blurPx <= 0.1) return sharp;

    vec3 blurred = texture2D(u_scene, coverUv(greenUv)).rgb * 0.28;
    blurred += texture2D(u_scene, coverUv(greenUv + vec2(blurStep.x, 0.0))).rgb * 0.12;
    blurred += texture2D(u_scene, coverUv(greenUv - vec2(blurStep.x, 0.0))).rgb * 0.12;
    blurred += texture2D(u_scene, coverUv(greenUv + vec2(0.0, blurStep.y))).rgb * 0.12;
    blurred += texture2D(u_scene, coverUv(greenUv - vec2(0.0, blurStep.y))).rgb * 0.12;
    blurred += texture2D(u_scene, coverUv(greenUv + blurStep)).rgb * 0.06;
    blurred += texture2D(u_scene, coverUv(greenUv - blurStep)).rgb * 0.06;
    blurred += texture2D(u_scene, coverUv(greenUv + vec2(blurStep.x, -blurStep.y))).rgb * 0.06;
    blurred += texture2D(u_scene, coverUv(greenUv + vec2(-blurStep.x, blurStep.y))).rgb * 0.06;

    return mix(sharp, blurred, clamp(blurPx / 18.0, 0.0, 0.88));
}

float roundedRectMask(vec2 localPx, vec2 sizePx, float radiusPx) {
    vec2 halfSize = sizePx * 0.5;
    float safeRadius = min(radiusPx, min(halfSize.x, halfSize.y));
    vec2 q = abs(localPx - halfSize) - (halfSize - vec2(safeRadius));
    float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - safeRadius;
    return 1.0 - smoothstep(-0.75, 1.25, distance);
}

void main() {
    vec2 screenCss = vec2(
        gl_FragCoord.x * (u_viewport_css.x / u_output_px.x),
        u_viewport_css.y - gl_FragCoord.y * (u_viewport_css.y / u_output_px.y)
    );
    vec2 sceneUv = vec2(
        screenCss.x / max(1.0, u_viewport_css.x),
        1.0 - screenCss.y / max(1.0, u_viewport_css.y)
    );

    if (u_mode < 0.5) {
        gl_FragColor = vec4(texture2D(u_scene, coverUv(sceneUv)).rgb, 1.0);
        return;
    }

    vec2 local = (screenCss - u_rect_css.xy) / max(u_rect_css.zw, vec2(1.0));
    vec2 p = local * 2.0 - 1.0;
    float superellipseDistance = pow(abs(p.x), 3.5) + pow(abs(p.y), 3.5);
    float bend = superellipseDistance <= 1.0
        ? sin(pow(clamp(superellipseDistance, 0.0, 1.0), 0.8) * 3.14159265)
        : 0.0;
    vec2 delta = (-p * bend * u_distortion_css) / max(u_viewport_css, vec2(1.0));
    float mask = roundedRectMask(
        local * u_rect_css.zw,
        u_rect_css.zw,
        u_radius_css
    );

    vec3 base = texture2D(u_scene, coverUv(sceneUv)).rgb;
    vec3 refracted = sampleScene(sceneUv, delta, u_blur_css);
    gl_FragColor = vec4(mix(base, refracted, mask), 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)
    if (!shader) return null

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
    }

    return shader
}

function createProgram(gl: WebGLRenderingContext) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    if (!vertex || !fragment) return null

    const program = gl.createProgram()
    if (!program) return null

    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program)
        return null
    }

    return program
}

function hasNativeVertexArrays(gl: WebGLRenderingContext) {
    return typeof (gl as WebGL2RenderingContext).bindVertexArray === 'function'
}

function getBoundVertexArray(
    gl: WebGLRenderingContext,
    extension: OES_vertex_array_object | null
) {
    const gl2 = gl as WebGL2RenderingContext
    if (hasNativeVertexArrays(gl)) {
        return gl2.getParameter(gl2.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
    }
    if (extension) {
        return gl.getParameter(extension.VERTEX_ARRAY_BINDING_OES) as WebGLVertexArrayObjectOES | null
    }
    return null
}

function bindVertexArray(
    gl: WebGLRenderingContext,
    extension: OES_vertex_array_object | null,
    vertexArray: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null
) {
    const gl2 = gl as WebGL2RenderingContext
    if (hasNativeVertexArrays(gl)) {
        gl2.bindVertexArray(vertexArray as WebGLVertexArrayObject | null)
    } else {
        extension?.bindVertexArrayOES(vertexArray as WebGLVertexArrayObjectOES | null)
    }
}

function saveVertexAttribState(gl: WebGLRenderingContext, location: number): SavedVertexAttribState {
    return {
        location,
        enabled: Boolean(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED)),
        buffer: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
        size: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE) as number,
        type: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE) as number,
        normalized: Boolean(gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED)),
        stride: gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE) as number,
        offset: gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER),
        current: new Float32Array(gl.getVertexAttrib(location, gl.CURRENT_VERTEX_ATTRIB) as Float32Array)
    }
}

function saveState(
    gl: WebGLRenderingContext,
    vaoExtension: OES_vertex_array_object | null,
    positionLocation: number
): SavedGlState {
    const gl2 = gl as WebGL2RenderingContext
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const activeTextureBinding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
    let texture0Binding = activeTextureBinding

    if (activeTexture !== gl.TEXTURE0) {
        gl.activeTexture(gl.TEXTURE0)
        texture0Binding = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
        gl.activeTexture(activeTexture)
    }

    const colorMask = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[]
    const supportsSeparateFramebuffers = typeof gl2.DRAW_FRAMEBUFFER === 'number'
    const supportsVertexArrays = hasNativeVertexArrays(gl) || Boolean(vaoExtension)

    return {
        program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
        framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
        drawFramebuffer: supportsSeparateFramebuffers
            ? gl2.getParameter(gl2.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
            : gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
        readFramebuffer: supportsSeparateFramebuffers
            ? gl2.getParameter(gl2.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
            : gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
        arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
        elementArrayBuffer: gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
        vertexArray: getBoundVertexArray(gl, vaoExtension),
        activeTexture,
        activeTextureBinding,
        texture0Binding,
        viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
        scissorBox: gl.getParameter(gl.SCISSOR_BOX) as Int32Array,
        colorMask: [
            Boolean(colorMask[0]),
            Boolean(colorMask[1]),
            Boolean(colorMask[2]),
            Boolean(colorMask[3])
        ],
        depthMask: Boolean(gl.getParameter(gl.DEPTH_WRITEMASK)),
        stencilMaskFront: gl.getParameter(gl.STENCIL_WRITEMASK) as number,
        stencilMaskBack: gl.getParameter(gl.STENCIL_BACK_WRITEMASK) as number,
        blend: gl.isEnabled(gl.BLEND),
        depthTest: gl.isEnabled(gl.DEPTH_TEST),
        cullFace: gl.isEnabled(gl.CULL_FACE),
        scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
        stencilTest: gl.isEnabled(gl.STENCIL_TEST),
        polygonOffsetFill: gl.isEnabled(gl.POLYGON_OFFSET_FILL),
        sampleAlphaToCoverage: gl.isEnabled(gl.SAMPLE_ALPHA_TO_COVERAGE),
        sampleCoverage: gl.isEnabled(gl.SAMPLE_COVERAGE),
        vertexAttrib: supportsVertexArrays ? null : saveVertexAttribState(gl, positionLocation)
    }
}

function restoreCapability(gl: WebGLRenderingContext, capability: number, enabled: boolean) {
    if (enabled) gl.enable(capability)
    else gl.disable(capability)
}

function restoreState(
    gl: WebGLRenderingContext,
    vaoExtension: OES_vertex_array_object | null,
    state: SavedGlState
) {
    const gl2 = gl as WebGL2RenderingContext

    if (typeof gl2.DRAW_FRAMEBUFFER === 'number') {
        gl2.bindFramebuffer(gl2.DRAW_FRAMEBUFFER, state.drawFramebuffer)
        gl2.bindFramebuffer(gl2.READ_FRAMEBUFFER, state.readFramebuffer)
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer)
    }

    bindVertexArray(gl, vaoExtension, state.vertexArray)
    if (state.vertexAttrib) {
        const attrib = state.vertexAttrib
        if (attrib.buffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, attrib.buffer)
            gl.vertexAttribPointer(
                attrib.location,
                attrib.size,
                attrib.type,
                attrib.normalized,
                attrib.stride,
                attrib.offset
            )
        }
        if (attrib.enabled) gl.enableVertexAttribArray(attrib.location)
        else gl.disableVertexAttribArray(attrib.location)
        gl.vertexAttrib4fv(attrib.location, attrib.current)
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.elementArrayBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, state.texture0Binding)
    if (state.activeTexture !== gl.TEXTURE0) {
        gl.activeTexture(state.activeTexture)
        gl.bindTexture(gl.TEXTURE_2D, state.activeTextureBinding)
    }

    gl.useProgram(state.program)
    gl.viewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3])
    gl.scissor(state.scissorBox[0], state.scissorBox[1], state.scissorBox[2], state.scissorBox[3])
    gl.colorMask(...state.colorMask)
    gl.depthMask(state.depthMask)
    gl.stencilMaskSeparate(gl.FRONT, state.stencilMaskFront)
    gl.stencilMaskSeparate(gl.BACK, state.stencilMaskBack)
    restoreCapability(gl, gl.BLEND, state.blend)
    restoreCapability(gl, gl.DEPTH_TEST, state.depthTest)
    restoreCapability(gl, gl.CULL_FACE, state.cullFace)
    restoreCapability(gl, gl.SCISSOR_TEST, state.scissorTest)
    restoreCapability(gl, gl.STENCIL_TEST, state.stencilTest)
    restoreCapability(gl, gl.POLYGON_OFFSET_FILL, state.polygonOffsetFill)
    restoreCapability(gl, gl.SAMPLE_ALPHA_TO_COVERAGE, state.sampleAlphaToCoverage)
    restoreCapability(gl, gl.SAMPLE_COVERAGE, state.sampleCoverage)
}

export class GlassRefractionRenderer {
    private readonly gl: WebGLRenderingContext
    private readonly program: WebGLProgram
    private readonly buffer: WebGLBuffer
    private readonly texture: WebGLTexture
    private readonly positionLocation: number
    private readonly uniforms: Record<string, WebGLUniformLocation | null>
    private readonly vaoExtension: OES_vertex_array_object | null
    private readonly vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null
    private textureWidth = 1
    private textureHeight = 1
    private textureAllocated = false

    constructor(gl: WebGLRenderingContext) {
        const program = createProgram(gl)
        const buffer = gl.createBuffer()
        const texture = gl.createTexture()
        if (!program || !buffer || !texture) {
            throw new Error('Unable to initialize shared glass renderer')
        }

        this.gl = gl
        this.program = program
        this.buffer = buffer
        this.texture = texture
        this.positionLocation = gl.getAttribLocation(program, 'a_position')
        if (this.positionLocation < 0) {
            gl.deleteTexture(texture)
            gl.deleteBuffer(buffer)
            gl.deleteProgram(program)
            throw new Error('Unable to locate shared glass geometry attribute')
        }
        const gl2 = gl as WebGL2RenderingContext
        this.vaoExtension = typeof gl2.createVertexArray === 'function'
            ? null
            : gl.getExtension('OES_vertex_array_object')
        this.vao = typeof gl2.createVertexArray === 'function'
            ? gl2.createVertexArray()
            : this.vaoExtension?.createVertexArrayOES() || null
        this.uniforms = {
            scene: gl.getUniformLocation(program, 'u_scene'),
            viewportCss: gl.getUniformLocation(program, 'u_viewport_css'),
            outputPx: gl.getUniformLocation(program, 'u_output_px'),
            sourceAspect: gl.getUniformLocation(program, 'u_source_aspect'),
            mode: gl.getUniformLocation(program, 'u_mode'),
            rectCss: gl.getUniformLocation(program, 'u_rect_css'),
            radiusCss: gl.getUniformLocation(program, 'u_radius_css'),
            distortionCss: gl.getUniformLocation(program, 'u_distortion_css'),
            dispersion: gl.getUniformLocation(program, 'u_dispersion'),
            blurCss: gl.getUniformLocation(program, 'u_blur_css')
        }

        const state = saveState(gl, this.vaoExtension, this.positionLocation)
        try {
            bindVertexArray(gl, this.vaoExtension, this.vao)
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
                gl.STATIC_DRAW
            )
            gl.enableVertexAttribArray(this.positionLocation)
            gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)

            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        } finally {
            restoreState(gl, this.vaoExtension, state)
        }
    }

    uploadSource(source: TexImageSource) {
        const gl = this.gl
        const sourceWithSize = source as TexImageSource & {
            width?: number
            height?: number
            naturalWidth?: number
            naturalHeight?: number
            videoWidth?: number
            videoHeight?: number
        }
        const nextWidth = Math.max(
            1,
            sourceWithSize.videoWidth || sourceWithSize.naturalWidth || sourceWithSize.width || 1
        )
        const nextHeight = Math.max(
            1,
            sourceWithSize.videoHeight || sourceWithSize.naturalHeight || sourceWithSize.height || 1
        )
        const canUpdateInPlace = this.textureAllocated &&
            nextWidth === this.textureWidth &&
            nextHeight === this.textureHeight

        const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
        gl.activeTexture(gl.TEXTURE0)
        const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
        const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean
        const previousPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean
        let succeeded = false

        try {
            gl.bindTexture(gl.TEXTURE_2D, this.texture)
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
            if (canUpdateInPlace) {
                gl.texSubImage2D(
                    gl.TEXTURE_2D,
                    0,
                    0,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    source
                )
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
            }
            succeeded = gl.getError() === gl.NO_ERROR
            if (succeeded) {
                this.textureWidth = nextWidth
                this.textureHeight = nextHeight
                this.textureAllocated = true
            }
        } finally {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip ? 1 : 0)
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply ? 1 : 0)
            gl.bindTexture(gl.TEXTURE_2D, previousTexture)
            gl.activeTexture(previousActiveTexture)
        }
        return succeeded
    }

    captureFramebuffer(width: number, height: number) {
        const gl = this.gl
        const nextWidth = Math.max(1, width)
        const nextHeight = Math.max(1, height)
        const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
        gl.activeTexture(gl.TEXTURE0)
        const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
        let succeeded = false

        try {
            gl.bindTexture(gl.TEXTURE_2D, this.texture)
            if (
                !this.textureAllocated ||
                nextWidth !== this.textureWidth ||
                nextHeight !== this.textureHeight
            ) {
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    nextWidth,
                    nextHeight,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    null
                )
            }
            gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, nextWidth, nextHeight)
            succeeded = gl.getError() === gl.NO_ERROR
            if (succeeded) {
                this.textureWidth = nextWidth
                this.textureHeight = nextHeight
                this.textureAllocated = true
            }
        } finally {
            gl.bindTexture(gl.TEXTURE_2D, previousTexture)
            gl.activeTexture(previousActiveTexture)
        }
        return succeeded
    }

    render(
        surfaces: RefractionSurfaceFrame[],
        viewportCss: { width: number; height: number },
        outputPx: { width: number; height: number },
        options: RendererOptions
    ) {
        const gl = this.gl
        const state = saveState(gl, this.vaoExtension, this.positionLocation)

        try {
            gl.useProgram(this.program)
            bindVertexArray(gl, this.vaoExtension, this.vao)
            if (!this.vao) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
                gl.enableVertexAttribArray(this.positionLocation)
                gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)
            }
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, this.texture)
            gl.uniform1i(this.uniforms.scene, 0)
            gl.uniform2f(this.uniforms.viewportCss, viewportCss.width, viewportCss.height)
            gl.uniform2f(this.uniforms.outputPx, outputPx.width, outputPx.height)
            gl.uniform1f(this.uniforms.sourceAspect, options.sourceWidth / Math.max(1, options.sourceHeight))
            gl.disable(gl.BLEND)
            gl.disable(gl.DEPTH_TEST)
            gl.disable(gl.CULL_FACE)
            gl.disable(gl.STENCIL_TEST)
            gl.disable(gl.POLYGON_OFFSET_FILL)
            gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
            gl.disable(gl.SAMPLE_COVERAGE)
            gl.colorMask(true, true, true, true)
            gl.depthMask(false)
            gl.stencilMaskSeparate(gl.FRONT, 0)
            gl.stencilMaskSeparate(gl.BACK, 0)
            gl.viewport(0, 0, outputPx.width, outputPx.height)

            if (options.drawBase) {
                gl.disable(gl.SCISSOR_TEST)
                gl.uniform1f(this.uniforms.mode, 0)
                gl.drawArrays(gl.TRIANGLES, 0, 6)
            }

            gl.enable(gl.SCISSOR_TEST)
            gl.uniform1f(this.uniforms.mode, 1)

            for (const surface of surfaces) {
                if (surface.width <= 0 || surface.height <= 0) continue

                const scaleX = outputPx.width / Math.max(1, viewportCss.width)
                const scaleY = outputPx.height / Math.max(1, viewportCss.height)
                const x = Math.max(0, Math.floor(surface.left * scaleX))
                const y = Math.max(0, Math.floor((viewportCss.height - surface.top - surface.height) * scaleY))
                const width = Math.min(outputPx.width - x, Math.ceil(surface.width * scaleX))
                const height = Math.min(outputPx.height - y, Math.ceil(surface.height * scaleY))
                if (width <= 0 || height <= 0) continue

                gl.scissor(x, y, width, height)
                gl.uniform4f(
                    this.uniforms.rectCss,
                    surface.left,
                    surface.top,
                    surface.width,
                    surface.height
                )
                gl.uniform1f(this.uniforms.radiusCss, surface.radius)
                gl.uniform1f(this.uniforms.distortionCss, surface.distortion)
                gl.uniform1f(this.uniforms.dispersion, surface.dispersion)
                gl.uniform1f(this.uniforms.blurCss, surface.blur)
                gl.drawArrays(gl.TRIANGLES, 0, 6)
            }
        } finally {
            restoreState(gl, this.vaoExtension, state)
        }
    }

    getSourceSize() {
        return { width: this.textureWidth, height: this.textureHeight }
    }

    destroy() {
        const gl2 = this.gl as WebGL2RenderingContext
        if (typeof gl2.deleteVertexArray === 'function') {
            gl2.deleteVertexArray(this.vao as WebGLVertexArrayObject | null)
        } else if (this.vaoExtension) {
            this.vaoExtension.deleteVertexArrayOES(this.vao as WebGLVertexArrayObjectOES | null)
        }
        this.gl.deleteTexture(this.texture)
        this.gl.deleteBuffer(this.buffer)
        this.gl.deleteProgram(this.program)
    }
}
