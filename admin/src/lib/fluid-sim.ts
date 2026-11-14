/**
 * Small WebGL fluid simulation (stable fluids: advection, viscous diffusion,
 * light vorticity confinement, Jacobi pressure solve) used as the sign-in
 * screen's animated blue/gold glow. Tuned to move like a thick, viscous liquid
 * rather than smoke. No dependencies; works on WebGL 2 and WebGL 1 with
 * half-float textures.
 *
 * The dye is continuously eased back towards a soft brand composition (gold
 * top-left, blue down the left edge), so stirring leaves swirls that heal
 * over a few seconds instead of washing the colours away.
 */

export interface FluidSim {
  /** Pointer position in 0..1 canvas coordinates (y up). Movement stirs the fluid. */
  pointerMove(x: number, y: number): void;
  /** Pointer left the area: the next move starts a fresh stroke. */
  pointerLeave(): void;
  /** Starts or stops the animation loop (the last frame stays on screen). */
  setRunning(running: boolean): void;
  dispose(): void;
}

export interface FluidOptions {
  /** False renders the resting composition once (reduced motion) and never animates. */
  animate?: boolean;
}

type GL = WebGLRenderingContext;

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelX: number;
  texelY: number;
  attach(unit: number): number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap(): void;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

/* ---------------------------------- tuning --------------------------------- */

const SIM_RESOLUTION = 128;
const DYE_RESOLUTION = 384;
/** Canvas pixels per CSS pixel: the glow is soft, so a reduced buffer is plenty (and cheap). */
const CANVAS_SCALE = 0.6;
const PRESSURE_ITERATIONS = 20;
const PRESSURE_DECAY = 0.8;
const VELOCITY_DISSIPATION = 0.9;
/** Vorticity confinement: kept low, since strong swirl forcing is what makes it look like smoke. */
const CURL = 3;
/** Kinematic viscosity (texels²/s): damps small eddies so motion folds like thick paint. */
const VISCOSITY = 45;
const VISCOSITY_ITERATIONS = 10;
/** Seconds for stirred dye to settle back towards the resting composition. */
const RELAX_TAU = 2.6;
const POINTER_FORCE = 3400;
const POINTER_RADIUS = 0.02;
const AMBIENT_RADIUS = 0.035;

/** Brand colours as display RGB (brand-gold #ffc200, a lit brand-blue). */
const GOLD: [number, number, number] = [0.96, 0.74, 0.04];
const BLUE: [number, number, number] = [0.08, 0.34, 0.72];

/* --------------------------------- shaders --------------------------------- */

const VERTEX = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SPLAT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
}`;

const ADVECTION = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 result = texture2D(uSource, coord);
#endif
  gl_FragColor = result / (1.0 + dissipation * dt);
}`;

const DIVERGENCE = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL_SHADER = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}`;

const PRESSURE = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}`;

/** One Jacobi step of implicit viscous diffusion: (1 + 4a) v = v0 + a (L + R + T + B). */
const VISCOSITY_SHADER = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
uniform sampler2D uVelocity0;
uniform float alpha;
void main () {
  vec2 L = texture2D(uVelocity, vL).xy;
  vec2 R = texture2D(uVelocity, vR).xy;
  vec2 T = texture2D(uVelocity, vT).xy;
  vec2 B = texture2D(uVelocity, vB).xy;
  vec2 v0 = texture2D(uVelocity0, vUv).xy;
  gl_FragColor = vec4((v0 + alpha * (L + R + T + B)) / (1.0 + 4.0 * alpha), 0.0, 1.0);
}`;

const SCALE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () {
  gl_FragColor = value * texture2D(uTexture, vUv);
}`;

/** Eases the dye towards the resting composition, which drifts very slowly on its own. */
const RELAX = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform float amount;
uniform float time;
uniform vec3 gold;
uniform vec3 blue;
vec3 composition (vec2 uv) {
  // Blue down the left edge, with a softly waving inner boundary.
  float edge = uv.x + 0.045 * sin(uv.y * 3.1 + time * 0.35) + 0.03 * sin(uv.y * 7.0 - time * 0.5);
  float b = 1.0 - smoothstep(0.16, 0.52, edge);
  // Gold glow in the top-left corner.
  vec2 g = (uv - vec2(0.03 + 0.03 * sin(time * 0.27), 0.80 + 0.04 * sin(time * 0.21))) / vec2(0.30, 0.40);
  float gm = 1.0 - smoothstep(0.35, 1.05, length(g));
  return mix(blue * b, gold, gm);
}
void main () {
  vec3 current = texture2D(uSource, vUv).rgb;
  gl_FragColor = vec4(mix(current, composition(vUv), amount), 1.0);
}`;

/**
 * Final output: soft surface shading from the dye's slopes (so folds read as a
 * glossy liquid rather than mist), plus a fine film grain that also hides banding.
 */
const DISPLAY = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uTexture;
uniform vec2 texelSize;
uniform float time;
float hash (vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453);
}
void main () {
  vec3 c = clamp(texture2D(uTexture, vUv).rgb, 0.0, 1.0);
  float dx = length(texture2D(uTexture, vR).rgb) - length(texture2D(uTexture, vL).rgb);
  float dy = length(texture2D(uTexture, vT).rgb) - length(texture2D(uTexture, vB).rgb);
  vec3 n = normalize(vec3(dx, dy, length(texelSize) * 2.5));
  vec3 light = normalize(vec3(-0.35, 0.45, 1.0));
  float diffuse = clamp(dot(n, light) + 0.25, 0.72, 1.08);
  float sheen = pow(max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.12;
  c = c * diffuse + sheen * c;
  c += (hash(gl_FragCoord.xy) - 0.5) * 0.035;
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------------------------------- setup ---------------------------------- */

export function createFluidSim(canvas: HTMLCanvasElement, { animate = true }: FluidOptions = {}): FluidSim {
  const attributes: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false,
  };
  const gl2 = canvas.getContext("webgl2", attributes);
  const context = (gl2 ?? canvas.getContext("webgl", attributes)) as GL | null;
  if (!context) throw new Error("WebGL is not available.");
  const gl: GL = context;

  // Half-float render targets.
  let internalFormat: number;
  let format: number;
  let texType: number;
  let linear: boolean;
  if (gl2) {
    gl2.getExtension("EXT_color_buffer_float");
    internalFormat = gl2.RGBA16F;
    format = gl2.RGBA;
    texType = gl2.HALF_FLOAT;
    linear = true; // RGBA16F is filterable in WebGL 2
  } else {
    const half = gl.getExtension("OES_texture_half_float");
    if (!half) throw new Error("Half-float textures are not supported.");
    internalFormat = gl.RGBA;
    format = gl.RGBA;
    texType = half.HALF_FLOAT_OES;
    linear = !!gl.getExtension("OES_texture_half_float_linear");
  }
  if (!canRenderTo(gl, internalFormat, format, texType)) throw new Error("Half-float render targets are not supported.");
  const filter = linear ? gl.LINEAR : gl.NEAREST;

  const programs: Program[] = [];
  const program = (fragment: string, defines = "") => {
    const p = createProgram(gl, VERTEX, defines + fragment);
    programs.push(p);
    return p;
  };
  const splatProgram = program(SPLAT);
  const advectionProgram = program(ADVECTION, linear ? "" : "#define MANUAL_FILTERING\n");
  const divergenceProgram = program(DIVERGENCE);
  const curlProgram = program(CURL_SHADER);
  const vorticityProgram = program(VORTICITY);
  const pressureProgram = program(PRESSURE);
  const gradientProgram = program(GRADIENT_SUBTRACT);
  const scaleProgram = program(SCALE);
  const relaxProgram = program(RELAX);
  const viscosityProgram = program(VISCOSITY_SHADER);
  const displayProgram = program(DISPLAY);

  // Full-screen quad.
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.disable(gl.BLEND);

  const blit = (target: FBO | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  const createFBO = (width: number, height: number): FBO => {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, texType, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture,
      fbo,
      width,
      height,
      texelX: 1 / width,
      texelY: 1 / height,
      attach(unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      },
    };
  };

  const createDoubleFBO = (width: number, height: number): DoubleFBO => {
    const pair = { read: createFBO(width, height), write: createFBO(width, height) };
    return {
      get read() {
        return pair.read;
      },
      get write() {
        return pair.write;
      },
      swap() {
        [pair.read, pair.write] = [pair.write, pair.read];
      },
    };
  };

  const deleteFBO = (f: FBO) => {
    gl.deleteTexture(f.texture);
    gl.deleteFramebuffer(f.fbo);
  };

  let dye: DoubleFBO;
  let velocity: DoubleFBO;
  let pressure: DoubleFBO;
  let divergence: FBO;
  let curl: FBO;
  let velocity0: FBO;
  let ready = false;

  const resolution = (size: number) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(size);
    const max = Math.round(size * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  };

  const initFramebuffers = () => {
    if (ready) {
      [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write, divergence, curl, velocity0].forEach(deleteFBO);
    }
    const sim = resolution(SIM_RESOLUTION);
    const dyeRes = resolution(DYE_RESOLUTION);
    dye = createDoubleFBO(dyeRes.width, dyeRes.height);
    velocity = createDoubleFBO(sim.width, sim.height);
    pressure = createDoubleFBO(sim.width, sim.height);
    divergence = createFBO(sim.width, sim.height);
    curl = createFBO(sim.width, sim.height);
    velocity0 = createFBO(sim.width, sim.height);
    ready = true;
    relax(1); // start from the resting composition
  };

  const resizeCanvas = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 1) * CANVAS_SCALE;
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width === width && canvas.height === height && ready) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
  };

  /* ------------------------------ simulation ------------------------------- */

  let time = 0;

  const bind = (p: Program, texelX: number, texelY: number) => {
    gl.useProgram(p.program);
    gl.uniform2f(p.uniforms.texelSize, texelX, texelY);
    return p.uniforms;
  };

  function relax(amount: number) {
    const u = bind(relaxProgram, dye.read.texelX, dye.read.texelY);
    gl.uniform1i(u.uSource, dye.read.attach(0));
    gl.uniform1f(u.amount, amount);
    gl.uniform1f(u.time, time);
    gl.uniform3f(u.gold, ...GOLD);
    gl.uniform3f(u.blue, ...BLUE);
    blit(dye.write);
    dye.swap();
  }

  const aspect = () => canvas.width / canvas.height;

  const splat = (target: DoubleFBO, x: number, y: number, color: [number, number, number], radius: number) => {
    const u = bind(splatProgram, target.read.texelX, target.read.texelY);
    gl.uniform1i(u.uTarget, target.read.attach(0));
    gl.uniform1f(u.aspectRatio, aspect());
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, ...color);
    gl.uniform1f(u.radius, aspect() > 1 ? radius * aspect() : radius);
    blit(target.write);
    target.swap();
  };

  const step = (dt: number) => {
    const tx = velocity.read.texelX;
    const ty = velocity.read.texelY;

    let u = bind(curlProgram, tx, ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(curl);

    u = bind(vorticityProgram, tx, ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uCurl, curl.attach(1));
    gl.uniform1f(u.curl, CURL);
    gl.uniform1f(u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    // Viscosity: implicit diffusion of the velocity, solved with a few Jacobi steps.
    u = bind(scaleProgram, tx, ty);
    gl.uniform1i(u.uTexture, velocity.read.attach(0));
    gl.uniform1f(u.value, 1);
    blit(velocity0);
    u = bind(viscosityProgram, tx, ty);
    gl.uniform1i(u.uVelocity0, velocity0.attach(1));
    gl.uniform1f(u.alpha, VISCOSITY * dt);
    for (let i = 0; i < VISCOSITY_ITERATIONS; i++) {
      gl.uniform1i(u.uVelocity, velocity.read.attach(0));
      blit(velocity.write);
      velocity.swap();
    }

    u = bind(divergenceProgram, tx, ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    u = bind(scaleProgram, tx, ty);
    gl.uniform1i(u.uTexture, pressure.read.attach(0));
    gl.uniform1f(u.value, PRESSURE_DECAY);
    blit(pressure.write);
    pressure.swap();

    u = bind(pressureProgram, tx, ty);
    gl.uniform1i(u.uDivergence, divergence.attach(0));
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    u = bind(gradientProgram, tx, ty);
    gl.uniform1i(u.uPressure, pressure.read.attach(0));
    gl.uniform1i(u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    u = bind(advectionProgram, tx, ty);
    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, velocity.read.attach(0));
    gl.uniform2f(u.dyeTexelSize, tx, ty);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.dissipation, VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform2f(u.dyeTexelSize, dye.read.texelX, dye.read.texelY);
    gl.uniform1f(u.dissipation, 0);
    blit(dye.write);
    dye.swap();

    relax(1 - Math.exp(-dt / RELAX_TAU));
  };

  const render = () => {
    const u = bind(displayProgram, dye.read.texelX, dye.read.texelY);
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    gl.uniform1f(u.time, animate ? time % 100 : 0);
    blit(null);
  };

  /* ------------------------------ interaction ------------------------------ */

  const pointer = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
  let nextAmbient = 0;

  const applyInput = () => {
    if (pointer.dx !== 0 || pointer.dy !== 0) {
      // Stir only (no added dye): the existing blue and gold swirl, so colours never wash out.
      splat(velocity, pointer.x, pointer.y, [pointer.dx * POINTER_FORCE, pointer.dy * POINTER_FORCE, 0], POINTER_RADIUS);
      pointer.dx = 0;
      pointer.dy = 0;
    }
    // Gentle ambient currents inside the coloured area, so it keeps flowing on its own.
    if (time > nextAmbient) {
      nextAmbient = time + 0.8 + Math.random() * 0.9;
      const angle = Math.random() * Math.PI * 2;
      const strength = 40 + Math.random() * 60;
      splat(velocity, Math.random() * 0.45, 0.1 + Math.random() * 0.85, [Math.cos(angle) * strength, Math.sin(angle) * strength, 0], AMBIENT_RADIUS);
    }
  };

  /* ---------------------------------- loop --------------------------------- */

  let raf = 0;
  let running = false;
  let last = 0;

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    time += dt;
    if (resizeCanvas()) initFramebuffers();
    applyInput();
    step(dt);
    render();
    if (running) raf = requestAnimationFrame(frame);
  };

  // While stopped (or static), keep the still picture correct when the size changes.
  const observer = new ResizeObserver(() => {
    if (running) return;
    if (resizeCanvas()) initFramebuffers();
    render();
  });
  observer.observe(canvas);

  resizeCanvas();
  initFramebuffers();
  render();

  return {
    pointerMove(x, y) {
      if (!animate) return;
      if (!pointer.active) {
        pointer.active = true;
        pointer.x = x;
        pointer.y = y;
        return;
      }
      let dx = x - pointer.x;
      let dy = y - pointer.y;
      const a = aspect();
      if (a < 1) dx *= a;
      if (a > 1) dy /= a;
      pointer.dx += dx;
      pointer.dy += dy;
      pointer.x = x;
      pointer.y = y;
    },
    pointerLeave() {
      pointer.active = false;
    },
    setRunning(next) {
      running = next && animate;
      if (running && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!running && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (ready) [dye.read, dye.write, velocity.read, velocity.write, pressure.read, pressure.write, divergence, curl, velocity0].forEach(deleteFBO);
      programs.forEach((p) => gl.deleteProgram(p.program));
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      // No loseContext(): the canvas (and its context) can be reused, e.g. by React Strict Mode's remount.
    },
  };
}

/* --------------------------------- helpers --------------------------------- */

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed.");
  return shader;
}

function createProgram(gl: GL, vertexSource: string, fragmentSource: string): Program {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed.");

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)!.name;
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

function canRenderTo(gl: GL, internalFormat: number, format: number, type: number): boolean {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(texture);
  return ok;
}
