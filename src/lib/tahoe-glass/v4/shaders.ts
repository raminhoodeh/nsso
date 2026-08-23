export const TAHOE_V4_VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/**
 * Exact volumetric CLOUDS shader logic from Vanta 0.5.24 (MIT), ported from
 * https://cdn.jsdelivr.net/npm/vanta@0.5.24/src/vanta.clouds.js
 *
 * Only uniform names and the input seam differ: mouse input is deterministic,
 * and `uHorizonOffset` replaces NSSO's previous runtime source-string patch.
 */
export const TAHOE_V4_CLOUD_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 uResolution;
  uniform vec2 uCameraInput;
  uniform float uTime;
  uniform float uHorizonOffset;
  uniform float uSpeed;
  uniform vec3 uSkyColor;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudShadowColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunlightColor;
  uniform vec3 uSunGlareColor;

  float hash(float p) {
    p = fract(p * 0.011);
    p *= (p + 7.5);
    p *= (p + p);
    return fract(p);
  }

  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;
    return mix(mix(mix(hash(n+0.0), hash(n+1.0), f.x),
                   mix(hash(n+57.0), hash(n+58.0), f.x), f.y),
               mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                   mix(hash(n+170.0), hash(n+171.0), f.x), f.y), f.z);
  }

  const float constantTime = 1000.0;
  float map5(in vec3 p) {
    vec3 speed1 = vec3(0.5,0.01,1.0) * 0.5 * uSpeed;
    vec3 q = p - speed1*(uTime + constantTime);
    float f;
    f  = 0.50000*noise(q); q = q*2.02;
    f += 0.25000*noise(q); q = q*2.03;
    f += 0.12500*noise(q); q = q*2.01;
    f += 0.06250*noise(q); q = q*2.02;
    f += 0.03125*noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75*f, 0.0, 1.0);
  }
  float map4(in vec3 p) {
    vec3 speed1 = vec3(0.5,0.01,1.0) * 0.5 * uSpeed;
    vec3 q = p - speed1*(uTime + constantTime);
    float f;
    f  = 0.50000*noise(q); q = q*2.02;
    f += 0.25000*noise(q); q = q*2.03;
    f += 0.12500*noise(q); q = q*2.01;
    f += 0.06250*noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75*f, 0.0, 1.0);
  }
  float map3(in vec3 p) {
    vec3 speed1 = vec3(0.5,0.01,1.0) * 0.5 * uSpeed;
    vec3 q = p - speed1*(uTime + constantTime);
    float f;
    f  = 0.50000*noise(q); q = q*2.02;
    f += 0.25000*noise(q); q = q*2.03;
    f += 0.12500*noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75*f, 0.0, 1.0);
  }
  float map2(in vec3 p) {
    vec3 speed1 = vec3(0.5,0.01,1.0) * 0.5 * uSpeed;
    vec3 q = p - speed1*(uTime + constantTime);
    float f;
    f  = 0.50000*noise(q); q = q*2.02;
    f += 0.25000*noise(q);
    return clamp(1.5 - p.y - 2.0 + 1.75*f, 0.0, 1.0);
  }

  vec3 sundir = normalize(vec3(-1.0,0.0,-1.0));

  vec4 integrate(in vec4 sum, in float dif, in float den, in vec3 bgcol, in float t) {
    vec3 lin = uCloudColor*1.4 + uSunlightColor*dif;
    vec4 col = vec4(mix(vec3(1.0,0.95,0.8), uCloudShadowColor, den), den);
    col.xyz *= lin;
    col.xyz = mix(col.xyz, bgcol, 1.0-exp(-0.003*t*t));
    col.a *= 0.4;
    col.rgb *= col.a;
    return sum + col*(1.0-sum.a);
  }

  #define MARCH(STEPS,MAPLOD) for(int i=0; i<STEPS; i++) { vec3 pos = ro + t*rd; if(pos.y<-3.0 || pos.y>2.0 || sum.a > 0.99) break; float den = MAPLOD(pos); if(den>0.01) { float dif = clamp((den - MAPLOD(pos+0.3*sundir))/0.6, 0.0, 1.0); sum = integrate(sum, dif, den, bgcol, t); } t += max(0.075,0.02*t); }

  vec4 raymarch(in vec3 ro, in vec3 rd, in vec3 bgcol, in ivec2 px) {
    vec4 sum = vec4(0.0);
    float t = 0.0;
    MARCH(20,map5);
    MARCH(25,map4);
    MARCH(30,map3);
    MARCH(40,map2);
    return clamp(sum, 0.0, 1.0);
  }

  mat3 setCamera(in vec3 ro, in vec3 ta, float cr) {
    vec3 cw = normalize(ta-ro);
    vec3 cp = vec3(sin(cr), cos(cr),0.0);
    vec3 cu = normalize(cross(cw,cp));
    vec3 cv = normalize(cross(cu,cw));
    return mat3(cu, cv, cw);
  }

  vec4 render(in vec3 ro, in vec3 rd, in ivec2 px) {
    float sun = clamp(dot(sundir,rd), 0.0, 1.0);
    vec3 col = uSkyColor - rd.y*0.2*vec3(1.0,0.5,1.0) + 0.15*0.5;
    col += 0.2*uSunColor*pow(sun, 8.0);
    vec4 res = raymarch(ro, rd, col, px);
    col = col*(1.0-res.w) + res.xyz;
    col += 0.2*uSunGlareColor*pow(sun, 3.0);
    return vec4(col, 1.0);
  }

  void main() {
    vec2 p = (-uResolution.xy + 2.0*gl_FragCoord.xy) / uResolution.y;
    p.y += uHorizonOffset;

    vec2 m = uCameraInput;
    m.y = (1.0 - m.y) * 0.33 + 0.28;
    m.x *= 0.25;
    m.x += sin(uTime * 0.1 + 3.1415) * 0.25 + 0.25;

    vec3 ro = 4.0*normalize(vec3(sin(3.0*m.x), 0.4*m.y, cos(3.0*m.x)));
    vec3 ta = vec3(0.0, -1.0, 0.0);
    mat3 ca = setCamera(ro, ta, 0.0);
    vec3 rd = ca * normalize(vec3(p.xy,1.5));
    gl_FragColor = render(ro, rd, ivec2(gl_FragCoord-0.5));
  }
`;

export const TAHOE_V4_TEXTURE_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uSource;
  uniform vec2 uResolution;
  uniform vec2 uSourceSize;
  uniform vec2 uPosition;
  uniform float uFit;

  vec2 sourceUv(vec2 viewportUv) {
    if (uFit < 0.5) return viewportUv;

    float viewportAspect = uResolution.x / max(uResolution.y, 1.0);
    float sourceAspect = uSourceSize.x / max(uSourceSize.y, 1.0);
    vec2 mapped = viewportUv;

    if (uFit < 1.5) {
      if (sourceAspect > viewportAspect) {
        float visibleWidth = viewportAspect / sourceAspect;
        mapped.x = (viewportUv.x - uPosition.x) * visibleWidth + uPosition.x;
      } else {
        float visibleHeight = sourceAspect / viewportAspect;
        mapped.y = (viewportUv.y - uPosition.y) * visibleHeight + uPosition.y;
      }
      return mapped;
    }

    if (sourceAspect > viewportAspect) {
      float occupiedHeight = viewportAspect / sourceAspect;
      mapped.y = (viewportUv.y - uPosition.y) / occupiedHeight + uPosition.y;
    } else {
      float occupiedWidth = sourceAspect / viewportAspect;
      mapped.x = (viewportUv.x - uPosition.x) / occupiedWidth + uPosition.x;
    }
    return mapped;
  }

  void main() {
    vec2 mapped = sourceUv(vUv);
    if (mapped.x < 0.0 || mapped.x > 1.0 || mapped.y < 0.0 || mapped.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = texture2D(uSource, mapped);
  }
`;

export const TAHOE_V4_COMPOSITE_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uScene;
  uniform sampler2D uDisplacement;
  uniform vec2 uResolution;
  uniform float uScale;

  void main() {
    // CPU registry maps are top-to-bottom while WebGL texture coordinates are
    // bottom-to-top. Keep the conversion explicit and backend-independent.
    vec4 displacement = texture2D(uDisplacement, vec2(vUv.x, 1.0 - vUv.y));
    vec2 bend = (displacement.rg - 0.5) * 2.0 * uScale * displacement.a;
    vec2 sampleUv = vUv + vec2(
      bend.x / max(uResolution.x, 1.0),
      -bend.y / max(uResolution.y, 1.0)
    );
    sampleUv = clamp(sampleUv, vec2(0.0), vec2(1.0));
    gl_FragColor = texture2D(uScene, sampleUv);
  }
`;
