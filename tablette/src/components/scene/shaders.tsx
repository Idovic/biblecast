/* Effets riches en WebGL 1 — pensés pour les TV d'entrée de gamme :
   - calcul en petite taille (640 × 360 au plus) puis agrandi par l'écran ;
   - 30 images par seconde au maximum ;
   - temps calé sur l'horloge (toutes les TV montrent le même mouvement) ;
   - fluidité mesurée pendant les premières secondes (voir onFps) pour basculer en CSS si besoin. */
import { useEffect, useRef } from 'react';

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float t; uniform vec2 r; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p *= 2.02; a *= 0.5; } return v; }
`;

const SHADERS: Record<string, string> = {
  // Rideaux d'aurore qui ondulent en haut de l'écran
  aurora: `void main(){ vec2 uv = gl_FragCoord.xy / r; vec2 p = vec2(uv.x * r.x / r.y, uv.y);
    float w = fbm(vec2(p.x * 1.2 + t * 0.04, t * 0.03));
    float band = smoothstep(0.18, 0.62, uv.y + 0.2 * (w - 0.5)) * (1.0 - smoothstep(0.9, 1.08, uv.y));
    float streak = 0.6 + 0.4 * sin(p.x * 9.0 + w * 14.0 + t * 0.3);
    float k = fbm(vec2(p.x * 0.7 - t * 0.02, 1.3));
    vec3 col = mix(c1, c2, smoothstep(0.3, 0.6, k));
    col = mix(col, c3, smoothstep(0.55, 0.8, fbm(vec2(p.x * 0.5 + 3.0, t * 0.02))));
    gl_FragColor = vec4(col * band * (0.45 + 0.7 * streak) * 1.25 + vec3(0.01, 0.015, 0.03), 1.0); }`,
  // Éclat de rayons colorés depuis le centre
  prism: `void main(){ vec2 uv = (gl_FragCoord.xy - 0.5 * r) / r.y; float a = atan(uv.y, uv.x); float d = length(uv);
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + t * 0.25 + fbm(vec2(a * 2.0, t * 0.1)) * 4.0), 3.0);
    rays += pow(0.5 + 0.5 * sin(a * 15.0 - t * 0.18), 6.0) * 0.6;
    float fall = smoothstep(1.2, 0.05, d);
    vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(a * 3.0 + t * 0.1)); col = mix(col, c3, smoothstep(0.2, 0.9, d));
    vec3 o = (col * rays * 0.8 + col * 0.06) * fall; o *= smoothstep(0.0, 0.25, d) * 0.75 + 0.25;
    gl_FragColor = vec4(o, 1.0); }`,
  // Tissu de soie qui ondule
  silk: `void main(){ vec2 uv = gl_FragCoord.xy / r; vec2 p = uv * vec2(r.x / r.y, 1.0) * 2.0; float tt = t * 0.15;
    float v = sin(p.x * 1.3 + sin(p.y * 1.7 + tt) * 1.4 + tt) + sin(p.y * 2.1 + sin(p.x * 1.1 - tt * 0.8) * 1.2);
    float f = 0.5 + 0.5 * sin(v * 2.2); float sh = pow(f, 3.0);
    vec3 col = mix(c1, c2, uv.y + 0.2 * sin(v)); col = mix(col, c3, sh * 0.6);
    gl_FragColor = vec4(col * (0.35 + 0.75 * f), 1.0); }`,
  // Rayons de lumière tombant d'en haut
  rays: `void main(){ vec2 uv = gl_FragCoord.xy / r; vec2 d = uv - vec2(0.3, 1.15); float a = atan(d.x, -d.y); float l = length(d);
    float s = pow(0.5 + 0.5 * sin(a * 22.0 + t * 0.2 + sin(a * 7.0 - t * 0.15) * 2.0), 4.0) + 0.5 * pow(0.5 + 0.5 * sin(a * 13.0 - t * 0.12), 5.0);
    float fall = smoothstep(1.4, 0.0, l);
    vec3 base = mix(c3 * 0.15, c1 * 0.25, uv.y);
    gl_FragColor = vec4(base + mix(c1, c2, uv.x) * s * fall * 0.55, 1.0); }`,
  // Galaxie spirale et étoiles
  galaxy: `void main(){ vec2 uv = (gl_FragCoord.xy - 0.5 * r) / r.y; float d = length(uv); float a = atan(uv.y, uv.x);
    float arms = pow(0.5 + 0.5 * cos((a + d * 4.0 - t * 0.05) * 2.0), 3.0) * smoothstep(0.9, 0.0, d);
    float neb = fbm(uv * 3.0 + vec2(t * 0.02, 0.0) + arms);
    vec3 col = mix(c1, c2, neb); col = mix(col, c3, smoothstep(0.0, 0.25, 0.25 - d));
    vec3 o = col * (arms * 0.9 + neb * 0.35) * smoothstep(1.1, 0.0, d);
    vec2 g = floor(gl_FragCoord.xy / 2.0); float st = step(0.996, h(g)); o += st * (0.5 + 0.5 * sin(t * 2.0 + h(g) * 40.0));
    gl_FragColor = vec4(o, 1.0); }`,
  // Plasma doux
  plasma: `void main(){ vec2 uv = gl_FragCoord.xy / r * vec2(r.x / r.y, 1.0) * 3.0; float tt = t * 0.2;
    float v = sin(uv.x + tt) + sin(uv.y * 1.3 - tt * 0.7) + sin((uv.x + uv.y) * 0.8 + tt * 0.5) + sin(length(uv - vec2(2.5, 1.5)) * 2.0 - tt);
    v *= 0.25; vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(v * 3.14)); col = mix(col, c3, 0.5 + 0.5 * cos(v * 6.28 + 1.0));
    gl_FragColor = vec4(col * 0.85, 1.0); }`,
};

let supportCache: boolean | null = null;
/** WebGL disponible sur cet appareil ? (testé une fois) */
export function shaderSupported(): boolean {
  if (supportCache !== null) return supportCache;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    supportCache = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { supportCache = false; }
  return supportCache;
}

function hex3(hex: string): [number, number, number] {
  const v = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
}

export function ShaderBackground({ shader, colors, paused, onFps }: {
  shader: string; colors: [string, string, string]; paused?: boolean; onFps?: (fps: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors); colorsRef.current = colors;
  const pausedRef = useRef(!!paused); pausedRef.current = !!paused;
  const onFpsRef = useRef(onFps); onFpsRef.current = onFps;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
    if (!gl) { onFpsRef.current?.(0); return; }
    // Petite résolution : 640 × 360 au plus, agrandie par CSS (l'effet est flou de toute façon)
    const W = 640, H = 360;
    canvas.width = W; canvas.height = H;
    const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }');
    const fs = mk(gl.FRAGMENT_SHADER, HEAD + (SHADERS[shader] ?? SHADERS.aurora));
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { onFpsRef.current?.(0); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uT = gl.getUniformLocation(prog, 't'), uR = gl.getUniformLocation(prog, 'r');
    const u1 = gl.getUniformLocation(prog, 'c1'), u2 = gl.getUniformLocation(prog, 'c2'), u3 = gl.getUniformLocation(prog, 'c3');
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uR, W, H);

    let raf = 0, last = 0, frames = 0, measureStart = 0, reported = false;
    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (pausedRef.current) return;
      if (now - last < 32) return; // 30 images par seconde au maximum
      last = now;
      const [a, b, c] = colorsRef.current;
      gl.uniform3fv(u1, hex3(a)); gl.uniform3fv(u2, hex3(b)); gl.uniform3fv(u3, hex3(c));
      gl.uniform1f(uT, (Date.now() / 1000) % 3600);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // Mesure de fluidité sur 4 secondes (après 1 s de mise en route)
      if (!reported) {
        if (!measureStart && now - t0 > 1000) measureStart = now;
        if (measureStart) {
          frames++;
          if (now - measureStart >= 4000) { reported = true; onFpsRef.current?.(Math.round(frames * 1000 / (now - measureStart))); }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [shader]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ imageRendering: 'auto' }} aria-hidden />;
}
