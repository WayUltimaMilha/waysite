/**
 * GLSL da experiência. Tudo escrito para WebGL2 (derivadas disponíveis).
 * Convenção: uniforms `u*`, atributos `a*`, varyings `v*`.
 */

/* ------------------------------------------------------- rota / tubo de luz */

export const routeVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const routeFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uOffset;
  uniform float uOpacity;
  uniform float uBase;
  uniform vec3  uColorLow;
  uniform vec3  uColorHot;

  varying vec2 vUv;

  void main() {
    // Cabeça de pulso correndo ao longo do tubo (u) com cauda exponencial.
    float t = fract(vUv.x - uTime * uSpeed + uOffset);
    float head = smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.035, 0.30, t));
    float tail = pow(1.0 - smoothstep(0.0, 0.55, t), 15.0) * 0.55;
    float pulse = head + tail;

    // Suaviza a silhueta na circunferência (v) para o tubo não parecer sólido.
    float rim = 1.0 - abs(vUv.y - 0.5) * 2.0;
    rim = pow(clamp(rim, 0.0, 1.0), 0.75);

    vec3  col   = mix(uColorLow, uColorHot, clamp(pulse * 1.35, 0.0, 1.0));
    float glow  = uBase + pulse * 1.9;
    float alpha = (uBase + pulse) * uOpacity * (0.28 + 0.72 * rim);

    gl_FragColor = vec4(col * glow, alpha);
  }
`;

/* ------------------------------------------------------------ poeira / nós */

export const dustVert = /* glsl */ `
  precision highp float;

  attribute float aScale;
  attribute float aSeed;

  uniform float uTime;
  uniform float uSize;
  uniform float uPix;

  varying float vTwinkle;

  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831853;
    p.x += sin(uTime * 0.16 + s) * 0.75;
    p.y += cos(uTime * 0.13 + s * 1.7) * 0.60;
    p.z += sin(uTime * 0.10 + s * 2.3) * 0.45;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPix * (70.0 / max(-mv.z, 0.001));

    vTwinkle = 0.30 + 0.70 * abs(sin(uTime * 0.65 + aSeed * 24.0));
  }
`;

export const dustFrag = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uOpacity;

  varying float vTwinkle;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vTwinkle * uOpacity);
  }
`;

/* -------------------------------------------------------------- piso / grade */

export const floorVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const floorFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uLine;
  uniform vec3  uGlow;
  uniform float uDensity;

  varying vec2 vUv;

  // Grade anti-serrilhada via derivadas: espessura constante em tela.
  float gridMask(vec2 uv, float n) {
    vec2 g = abs(fract(uv * n - 0.5) - 0.5) / fwidth(uv * n);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    // Rola a grade no eixo da profundidade — sensação de deslocamento.
    vec2 uv = vec2(vUv.x, vUv.y + uTime * 0.012);

    float fine   = gridMask(uv, uDensity);
    float coarse = gridMask(uv, uDensity * 0.2) * 1.4;

    // Desvanece no horizonte e nas laterais.
    float depth = smoothstep(0.0, 0.42, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));
    float side  = 1.0 - smoothstep(0.30, 0.5, abs(vUv.x - 0.5));

    float g = (fine * 0.5 + coarse) * depth * side;

    // Faixa de brilho quente correndo pelo piso.
    float sweep = exp(-pow((fract(uTime * 0.05) - vUv.y) * 6.0, 2.0));

    vec3  col   = mix(uLine, uGlow, clamp(coarse * 0.8 + sweep, 0.0, 1.0));
    float alpha = g * uOpacity + sweep * depth * side * 0.10 * uOpacity;

    gl_FragColor = vec4(col * (0.55 + sweep * 1.4), alpha);
  }
`;

/* ---------------------------------------------------- carga / arestas de volume
 *
 * Volumes desenhados só pelas 12 arestas do cubo, num único draw call.
 * `wireframe: true` numa BoxGeometry não serve: ele desenha também a diagonal
 * de cada face triangulada, e o resultado lê como estilhaço, não como caixa.
 * A rotação e a flutuação são resolvidas no vertex shader — nada de recompor
 * matrizes na CPU a cada frame.
 */

export const cargoVert = /* glsl */ `
  precision highp float;

  attribute vec3  aCenter;
  attribute vec3  aScale;
  attribute vec3  aSpin;
  attribute float aSeed;

  uniform float uTime;

  varying float vSeed;
  varying float vDepth;

  mat3 rotXYZ(vec3 a) {
    float sx = sin(a.x), cx = cos(a.x);
    float sy = sin(a.y), cy = cos(a.y);
    float sz = sin(a.z), cz = cos(a.z);
    mat3 rx = mat3(1.0, 0.0, 0.0,  0.0, cx, -sx,  0.0, sx, cx);
    mat3 ry = mat3(cy, 0.0, sy,    0.0, 1.0, 0.0, -sy, 0.0, cy);
    mat3 rz = mat3(cz, -sz, 0.0,   sz, cz, 0.0,   0.0, 0.0, 1.0);
    return rz * ry * rx;
  }

  void main() {
    vSeed = aSeed;

    float phase = aSeed * 6.2831853;
    vec3 angles = aSpin * uTime + vec3(phase, phase * 1.7, phase * 2.3);

    vec3 local = rotXYZ(angles) * (position * aScale);

    // Deriva lenta: o campo respira em vez de ficar congelado no espaço.
    vec3 drift = vec3(
      cos(uTime * 0.19 + phase) * 0.8,
      sin(uTime * 0.24 + phase) * 1.2,
      sin(uTime * 0.15 + phase) * 0.6
    );

    vec4 mv = modelViewMatrix * vec4(local + aCenter + drift, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const cargoFrag = /* glsl */ `
  precision highp float;

  uniform vec3  uNear;
  uniform vec3  uMid;
  uniform vec3  uFar;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFogNear;
  uniform float uFogFar;

  varying float vSeed;
  varying float vDepth;

  void main() {
    // Cor por profundidade: o que está perto puxa para o laranja, o que está
    // longe esfria para o azul. Dá leitura de espaço sem precisar de sombra.
    float d = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);

    // A rampa passa por um meio claro. Interpolar laranja direto para azul
    // atravessa o magenta, e magenta não existe nesta marca.
    vec3 col = d < 0.5 ? mix(uNear, uMid, d * 2.0) : mix(uMid, uFar, (d - 0.5) * 2.0);

    // Cada volume pisca no seu ritmo, como um pacote sendo bipado.
    float blink = 0.72 + 0.28 * sin(uTime * 1.5 + vSeed * 31.0);

    // Distância também tira presença, senão o fundo vira uma teia uniforme.
    float alpha = (1.0 - d * 0.78) * blink * uOpacity;

    gl_FragColor = vec4(col * (1.35 - d * 0.5), clamp(alpha, 0.0, 1.0));
  }
`;

/* ---------------------------------------------------- mapa / matriz de pontos */

export const mapDotVert = /* glsl */ `
  precision highp float;

  attribute float aDist;   // distância normalizada até o polo mais próximo
  attribute float aSeed;
  attribute float aHub;    // 1.0 se o ponto está dentro do raio de um polo

  uniform float uTime;
  uniform float uWave;     // frente de onda 0→1 saindo dos polos
  uniform float uSize;
  uniform float uPix;
  uniform float uReveal;   // 0→1 conforme a seção entra em cena

  varying float vHot;
  varying float vFade;

  void main() {
    vec3 p = position;

    // Onda de propagação: dots acendem quando a frente passa por eles.
    float ring = 1.0 - smoothstep(0.0, 0.05, abs(aDist - uWave));

    // Respiração de fundo, dessincronizada por semente.
    float breath = 0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 18.0 + aDist * 9.0);

    vHot  = clamp(ring * 0.75 + aHub * 0.8, 0.0, 1.4);
    vFade = mix(0.34, 0.72, breath);

    // Levantamento em relevo enquanto o mapa se revela.
    p.z += (ring * 0.55 + aHub * 0.9) * uReveal;

    // Aparecimento radial: pontos próximos aos polos surgem primeiro.
    float appear = smoothstep(aDist - 0.12, aDist + 0.22, uReveal * 1.35);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPix * (1.0 + vHot * 1.5) * appear * (60.0 / max(-mv.z, 0.001));

    vFade *= appear;
  }
`;

export const mapDotFrag = /* glsl */ `
  precision highp float;

  uniform vec3  uCool;
  uniform vec3  uHot;
  uniform float uOpacity;

  varying float vHot;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d);

    vec3 col = mix(uCool, uHot, clamp(vHot, 0.0, 1.0));
    gl_FragColor = vec4(col * (0.85 + vHot * 1.3), a * (vFade + vHot * 0.6) * uOpacity);
  }
`;

/* ------------------------------------------------------- contorno do estado */

export const outlineVert = /* glsl */ `
  attribute float aProgress;   // 0→1 ao longo do perímetro
  varying float vProgress;
  void main() {
    vProgress = aProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const outlineFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uDraw;     // quanto do contorno já foi desenhado
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uHot;

  varying float vProgress;

  void main() {
    // Traçado progressivo do contorno.
    if (vProgress > uDraw) discard;

    // Ponto de luz percorrendo a borda.
    float sweep = fract(vProgress - uTime * 0.07);
    float spark = pow(1.0 - smoothstep(0.0, 0.05, sweep), 2.5);

    vec3  col   = mix(uColor, uHot, spark);
    float alpha = (0.42 + spark * 0.8) * uOpacity;

    gl_FragColor = vec4(col * (1.0 + spark * 2.0), alpha);
  }
`;

/* ------------------------------------------------- mostrador graduado (selo)
 *
 * Mesmo traçado progressivo do contorno, mas com marcas finas e periódicas
 * ao redor da circunferência — leitura de instrumento de precisão (dial de
 * relógio, não um círculo liso). A linha-base fica quase apagada; só as
 * marcas e o ponto de luz de fato acendem.
 */
export const dialFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uDraw;
  uniform float uOpacity;
  uniform float uTicks;    // marcas de graduação ao redor do anel
  uniform vec3  uColor;
  uniform vec3  uHot;

  varying float vProgress;

  void main() {
    if (vProgress > uDraw) discard;

    float band = fract(vProgress * uTicks);
    float tick = 1.0 - smoothstep(0.0, 0.1, band);

    float sweep = fract(vProgress - uTime * 0.05);
    float spark = pow(1.0 - smoothstep(0.0, 0.06, sweep), 2.5);

    vec3  col   = mix(uColor, uHot, spark);
    float alpha = (0.14 + tick * 0.5 + spark * 0.65) * uOpacity;

    gl_FragColor = vec4(col * (1.0 + tick * 0.6 + spark * 1.6), alpha);
  }
`;

/* -------------------------------------------------------------- arco de rota
 *
 * Tubo, não linha. `THREE.Line` ignora `linewidth` em praticamente todo
 * navegador: o arco sairia com 1px e só ficaria visível com bloom ligado —
 * ou seja, invisível no tier low. O tubo tem espessura de verdade.
 */

export const arcVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const arcFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uOffset;
  uniform float uDraw;
  uniform float uOpacity;
  uniform vec3  uColor;
  uniform vec3  uHot;

  varying vec2 vUv;

  void main() {
    // Traçado progressivo ao longo do comprimento do tubo.
    if (vUv.x > uDraw) discard;

    // Pacote correndo do polo de origem ao destino.
    float t = fract(vUv.x - uTime * uSpeed + uOffset);
    float head = pow(1.0 - smoothstep(0.0, 0.12, t), 3.0);

    // Silhueta suave na circunferência, senão o tubo parece um canudo sólido.
    float rim = pow(clamp(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0, 1.0), 0.7);

    // A ponta do traçado ganha um brilho — marca onde a rota está sendo aberta.
    float tip = pow(1.0 - smoothstep(0.0, 0.06, uDraw - vUv.x), 3.0) * (1.0 - step(0.999, uDraw));

    vec3  col   = mix(uColor, uHot, clamp(head + tip, 0.0, 1.0));
    float alpha = (0.34 + head * 0.85 + tip * 0.7) * uOpacity * (0.35 + 0.65 * rim);

    gl_FragColor = vec4(col * (1.1 + head * 2.2 + tip * 2.0), alpha);
  }
`;

/* --------------------------------------------------- feixe vertical do polo */

export const beamVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const beamFrag = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPhase;

  varying vec2 vUv;

  void main() {
    // Base densa, topo dissolvido — leitura de feixe de luz saindo do solo.
    float fade = pow(1.0 - vUv.y, 2.2);

    // Pacote de dados subindo pelo feixe.
    float rise = fract(uTime * 0.35 + uPhase);
    float packet = (1.0 - smoothstep(0.0, 0.12, abs(vUv.y - rise))) * 0.85;

    gl_FragColor = vec4(uColor * (fade * 1.6 + packet * 2.2), (fade * 0.55 + packet * 0.6) * uOpacity);
  }
`;

/* ------------------------------------------------------- halo aditivo (sprite) */

export const haloVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFrag = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uPhase;

  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;

    float core = pow(1.0 - d, 3.5);
    float ping = fract(uTime * 0.45 + uPhase);
    float ring = (1.0 - smoothstep(0.0, 0.10, abs(d - ping))) * (1.0 - ping) * 0.6;

    gl_FragColor = vec4(uColor * (core * 2.2 + ring * 1.4), (core + ring) * uOpacity);
  }
`;
