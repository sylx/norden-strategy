/**
 * Terrain shader.
 *
 * The macro textures (generateWorld.ts) carry the designed shape of the
 * island at 1 texel per world unit. Everything below that scale is added here
 * from noise, and the amount of detail follows the on-screen size of a
 * fragment / the vertex spacing of a tile. Zooming in therefore keeps
 * revealing finer coastlines, rock faces, tree crowns, dunes and ripples.
 */

export const terrainCommon = /* glsl */ `
uniform sampler2D uMacro;
uniform sampler2D uFlow;
uniform float uWorldSize;
uniform float uHeightScale;
uniform float uTime;
uniform float uTexturedForest;
uniform float uForestDensity;
uniform float uForestShade;

// --- hashing -----------------------------------------------------------------
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
uint hash2u(ivec2 p) { return pcg(uint(p.x) + pcg(uint(p.y))); }
float hash21(ivec2 p) { return float(hash2u(p)) * (1.0 / 4294967296.0); }
vec2 hash22(ivec2 p) {
  uint h = hash2u(p);
  return vec2(float(h & 0xffffu), float(h >> 16u)) * (1.0 / 65536.0);
}

// --- gradient noise with analytic derivatives (value, d/dx, d/dy) -------------
vec2 gradAt(ivec2 p) {
  return normalize(hash22(p) - 0.5 + 1e-4);
}
vec3 noised(vec2 p) {
  vec2 fl = floor(p);
  ivec2 i = ivec2(fl);
  vec2 f = p - fl;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = gradAt(i);
  vec2 gb = gradAt(i + ivec2(1, 0));
  vec2 gc = gradAt(i + ivec2(0, 1));
  vec2 gd = gradAt(i + ivec2(1, 1));
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float k = va - vb - vc + vd;
  return vec3(
    va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k,
    ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) +
      du * (u.yx * k + vec2(vb, vc) - va)
  ) * 1.4;
}

// --- macro textures ----------------------------------------------------------
// Smooth B-spline bicubic, so lighting shows no texel grid
vec4 macroAt(vec2 world) {
  vec2 res = vec2(textureSize(uMacro, 0));
  vec2 uv = world / uWorldSize * res - 0.5;
  vec2 iuv = floor(uv);
  vec2 f = uv - iuv;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;
  vec2 t0 = (iuv - 0.5 + w1 / s0) / res;
  vec2 t1 = (iuv + 1.5 + w3 / s1) / res;
  vec4 a = texture(uMacro, vec2(t0.x, t0.y));
  vec4 b = texture(uMacro, vec2(t1.x, t0.y));
  vec4 c = texture(uMacro, vec2(t0.x, t1.y));
  vec4 d = texture(uMacro, vec2(t1.x, t1.y));
  return mix(mix(d, c, s0.x), mix(b, a, s0.x), s0.y);
}

vec4 flowAt(vec2 world) {
  return texture(uFlow, world / uWorldSize);
}

// --- ground detail -----------------------------------------------------------
const float DETAIL_BASE_FREQ = 0.22; // first octave wavelength ~4.5 units

// Number of octaves whose wavelength is still resolved by a sample spacing
float octavesFor(float spacing) {
  return clamp(log2(1.0 / (DETAIL_BASE_FREQ * spacing * 2.5)) + 1.0, 0.0, 10.0);
}

float detailAmp(vec4 m, float desert) {
  float landish = smoothstep(-6.0, 0.5, m.r);
  float calmWater = 1.0 - smoothstep(0.25, 0.6, m.g);
  return mix(0.7, 3.4, m.b) * landish * calmWater * (1.0 - desert * 0.6);
}

// Fractal detail. Plains get soft rolling noise, mountains a ridged variant.
// Returns (value, gradient) in world units. 'octaves' may be fractional; the
// last octave fades in so LoD changes never pop.
vec3 detail(vec2 p, float octaves, float rugged) {
  vec3 sum = vec3(0.0);
  float freq = DETAIL_BASE_FREQ;
  float amp = 0.5;
  mat2 rot = mat2(1.0, 0.0, 0.0, 1.0);
  const mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 10; i++) {
    float w = clamp(octaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    vec2 q = rot * p * freq + vec2(float(i) * 17.31, float(i) * -9.73);
    vec3 n = noised(q);
    float r = 1.0 - abs(n.x);
    vec2 rg = -sign(n.x) * n.yz;
    float v = mix(n.x, r * r - 0.5, rugged);
    vec2 g = mix(n.yz, 2.0 * r * rg, rugged);
    sum.x += v * amp * w;
    sum.yz += (transpose(rot) * g) * freq * amp * w;
    freq *= 2.03;
    amp *= mix(0.5, 0.47, rugged);
    rot = R * rot;
  }
  return sum;
}

// --- forest canopy -----------------------------------------------------------
// x: coverage (crisp edge), y: canopy height factor (rises over a wider band
// so the wood swells up gently instead of standing like a wall)
vec2 forestMask(vec4 m, vec2 p) {
  float edgeN = noised(p * 0.25 + 7.0).x * 0.14 + noised(p * 0.07 - 3.0).x * 0.1;
  float v = m.a + edgeN;
  float notRock = 1.0 - smoothstep(0.35, 0.8, m.b) * 0.8;
  return vec2(smoothstep(0.38, 0.52, v), smoothstep(0.4, 0.95, v)) * notRock;
}

// Union of hemispheres on a jittered lattice: rounded, overlapping crowns.
struct Blobs {
  float h;   // height in world units
  vec2 g;    // gradient
  float rel; // height relative to the crown's radius (0 at the rim)
  float id;  // per-crown random value
};
// Cells whose hash exceeds 'density' stay empty, thinning the crowns out;
// crowns near the threshold shrink rather than get clipped where the
// density varies across them.
Blobs blobs(vec2 p, float freq, float radiusScale, float density) {
  vec2 q = p * freq;
  vec2 fl = floor(q);
  ivec2 i = ivec2(fl);
  vec2 f = q - fl;
  Blobs b = Blobs(0.0, vec2(0.0), 0.0, 0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 c = i + ivec2(x, y);
      float keep = clamp((density - hash21(c + ivec2(5, 9))) * 6.0, 0.0, 1.0);
      if (keep <= 0.0) continue;
      vec2 r = vec2(x, y) + 0.5 + (hash22(c) - 0.5) * 0.75 - f;
      float rad = mix(0.45, 0.9, hash21(c + ivec2(57, 31))) * radiusScale * mix(0.3, 1.0, keep);
      float s = rad * rad - dot(r, r);
      if (s <= 0.0) continue;
      float hh = sqrt(s);
      if (hh > b.h) {
        b.h = hh;
        b.g = r / max(hh, 0.05);
        b.rel = hh / rad;
        b.id = hash21(c + ivec2(913, 271));
      }
    }
  }
  b.h /= freq;
  return b;
}

struct Canopy { float h; vec2 g; float ao; float tone; float gap; };

// Three nested scales: woodland masses, groves, single trees. Each scale only
// shows up once it spans a few pixels ('spacing' = world units per sample).
// The larger scales are shaded more strongly than their actual height so
// woods look puffy from afar without turning into walls up close.
Canopy canopy(vec2 p, vec2 forest, float spacing) {
  float fm = forest.x;
  float fh = forest.y;
  float v3 = smoothstep(0.25, 0.1, spacing);
  // Up close single trees carry the volume; the broad masses flatten out
  float massH = mix(1.0, 0.4, v3);
  Canopy c = Canopy(fh * 0.3 * massH, vec2(0.0), 1.0, 0.5, 0.0);
  if (fm <= 0.0) return c;
  float radius = mix(0.35, 1.0, fm);

  // Hill-sized swells that make whole woods read as puffy from afar
  float v0 = smoothstep(9.0, 4.0, spacing);
  if (v0 > 0.0) {
    Blobs b = blobs(p + 71.3, 0.07, radius, 1.0);
    c.h += b.h * 0.03 * fh * v0 * massH;
    c.g += b.g * 0.35 * fh * v0 * mix(1.0, 0.3, v3);
    c.ao *= mix(1.0, mix(0.7, 1.0, b.rel), v0);
  }

  float v1 = smoothstep(3.5, 1.5, spacing);
  if (v1 > 0.0) {
    Blobs b = blobs(p, 0.16, radius, 1.0);
    c.h += b.h * 0.1 * fh * v1 * massH;
    c.g += b.g * mix(0.4, 0.12, v3) * fh * v1;
    c.ao *= mix(1.0, mix(0.55, 1.0, b.rel), v1);
    c.tone = mix(c.tone, b.id, 0.3 * v1);
  }
  float v2 = smoothstep(1.0, 0.4, spacing);
  if (v2 > 0.0) {
    Blobs b = blobs(p + 31.7, 0.6, radius, 1.0);
    c.h += b.h * 0.2 * fh * v2 * mix(1.0, 0.6, v3);
    c.g += b.g * mix(0.4, 0.25, v3) * fh * v2;
    c.ao *= mix(1.0, mix(0.6, 1.0, b.rel), v2);
    c.tone = mix(c.tone, b.id, 0.4 * v2);
  }
  if (v3 > 0.0) {
    // Trees thin out towards the edge of the wood
    Blobs b = blobs(p - 13.1, 2.4, mix(0.6, 1.0, fm), smoothstep(0.0, 0.7, fm) * 1.05);
    float k = v3;
    c.h += b.h * k;
    c.g += b.g * k;
    c.ao *= mix(1.0, mix(0.5, 1.0, b.rel), v3);
    c.tone = mix(c.tone, b.id, 0.7 * v3);
    c.gap = (b.h > 0.0 ? 0.0 : 1.0) * v3;
    // Leaf clusters on each crown, closest zoom only
    float v4 = smoothstep(0.09, 0.035, spacing);
    if (v4 > 0.0 && b.h > 0.0) {
      vec3 leaf = noised(p * 9.0 + b.id * 50.0);
      c.g += leaf.yz * 0.05 * v4;
      c.ao *= 1.0 - (0.5 - 0.5 * leaf.x) * 0.3 * v4;
    }
  }
  return c;
}

// --- desert dunes ------------------------------------------------------------
const vec2 WIND = vec2(0.8, 0.6);

float desertMask(float arid, vec2 p) {
  return smoothstep(0.35, 0.7, arid + noised(p * 0.05 + 11.0).x * 0.12);
}

// Asymmetric dune: long windward slope, steep lee face. Crest lines run across
// the (constant) wind and wander with a slow warp. Returns (height, gradient).
vec3 duneLayer(vec2 p, float wavelength, float warpFreq, float warpAmp, float seed) {
  vec3 w = noised(p * warpFreq + seed) * warpAmp;
  vec2 wg = w.yz * warpFreq;
  float u = (dot(p, WIND) + w.x) / wavelength;
  vec2 du = (WIND + wg) / wavelength;
  float s = fract(u);
  const float CREST = 0.72;
  float h, dh;
  if (s < CREST) {
    float t = s / CREST;
    h = t * t * (3.0 - 2.0 * t);
    dh = 6.0 * t * (1.0 - t) / CREST;
  } else {
    float t = (s - CREST) / (1.0 - CREST);
    h = 1.0 - t * t * (3.0 - 2.0 * t);
    dh = -6.0 * t * (1.0 - t) / (1.0 - CREST);
  }
  // Break the crests up along their length
  vec2 perp = vec2(-WIND.y, WIND.x);
  float a = 0.55 + 0.45 * noised(vec2(dot(p, perp), dot(p, WIND)) / (wavelength * 3.0) + seed).x;
  return vec3(h * a, du * dh * a);
}

vec3 dunes(vec2 p, float spacing) {
  vec3 d = vec3(0.0);
  float v1 = smoothstep(4.0, 1.5, spacing);
  if (v1 > 0.0) d += duneLayer(p, 9.0, 0.03, 9.0, 0.0) * 0.9 * v1;
  float v2 = smoothstep(0.8, 0.3, spacing);
  if (v2 > 0.0) d += duneLayer(p, 2.2, 0.15, 1.5, 5.3) * 0.14 * v2;
  float v3 = smoothstep(0.06, 0.025, spacing);
  if (v3 > 0.0) d += duneLayer(p, 0.25, 0.9, 0.3, 9.1) * 0.012 * v3;
  return d;
}

// Shared with tree cards, keeping their roots on the displaced terrain.
float groundHeight(vec2 p, float spacing) {
  vec4 m = macroAt(p);
  float desert = desertMask(flowAt(p).b, p);
  float h = m.r;
  if (m.r > -8.0) h += detail(p, octavesFor(spacing), m.b).x * detailAmp(m, desert);
  float y = max(h, 0.0);
  if (h > 0.0) {
    if (uTexturedForest < 0.5) y += canopy(p, forestMask(m, p), spacing).h;
    if (desert > 0.0) y += dunes(p, spacing).x * desert;
  }
  return y * uHeightScale;
}
`

export const terrainVertexShader = /* glsl */ `
${terrainCommon}
in vec4 aTile; // x0, z0, size, vertex spacing
out vec3 vWorld;

void main() {
  vec2 p = aTile.xy + position.xz * aTile.z;
  // Detail level from the camera distance rather than the tile, so that
  // neighbouring tiles of different size agree along their shared edge.
  // 45 ~ distance / vertex spacing at which the quadtree picks a tile.
  float spacing = max(distance(cameraPosition, vec3(p.x, 0.0, p.y)) / 45.0, aTile.w * 0.5);
  float y = groundHeight(p, spacing);
  // Skirts (position.y = 1) hang below the tile to hide cracks
  y -= position.y * max(spacing * 3.0, 0.5);
  vWorld = vec3(p.x, y, p.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`

export const terrainFragmentShader = /* glsl */ `
${terrainCommon}
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec3 vWorld;
out vec4 fragColor;

vec3 srgb(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }

// Directional swell; constant directions keep the pattern undistorted
const vec2 SWELL_D0 = vec2(0.83, 0.55);
const vec2 SWELL_D1 = vec2(0.45, 0.89);
const vec2 SWELL_D2 = vec2(0.97, -0.24);
const float SWELL_K0 = 6.2832 / 14.0;
const float SWELL_K1 = 6.2832 / 6.0;
const float SWELL_K2 = 6.2832 / 2.5;

// Each train comes in groups: its amplitude is modulated by drifting noise
vec2 swell(vec2 p, float t, float warp, float footprint) {
  vec2 g = vec2(0.0);
  float a0 = smoothstep(-0.4, 0.6, noised(p * 0.018 + vec2(t * 0.02, 0.0)).x);
  float a1 = smoothstep(-0.4, 0.6, noised(p * 0.05 - vec2(0.0, t * 0.04) + 3.0).x);
  float a2 = smoothstep(-0.4, 0.6, noised(p * 0.12 + vec2(t * 0.07, t * 0.05) + 8.0).x);
  g += SWELL_D0 * SWELL_K0 * 0.12 * a0 * cos(dot(SWELL_D0, p) * SWELL_K0 - t * 1.1 + warp) * smoothstep(5.0, 2.0, footprint);
  g += SWELL_D1 * SWELL_K1 * 0.07 * a1 * cos(dot(SWELL_D1, p) * SWELL_K1 - t * 1.7 + warp * 0.7) * smoothstep(2.0, 0.8, footprint);
  g += SWELL_D2 * SWELL_K2 * 0.04 * a2 * cos(dot(SWELL_D2, p) * SWELL_K2 - t * 2.6 + warp * 1.3) * smoothstep(0.8, 0.3, footprint);
  return g;
}

vec3 shadeSea(vec2 p, float depth, float footprint, vec3 V, vec3 L, vec3 sun) {
  float t = uTime;
  vec3 shallow = srgb(56.0, 168.0, 178.0);
  vec3 mid = srgb(28.0, 92.0, 150.0);
  vec3 deep = srgb(14.0, 40.0, 92.0);
  vec3 col = mix(shallow, mid, smoothstep(0.0, 3.5, depth));
  col = mix(col, deep, smoothstep(3.0, 26.0, depth));

  // Painted streaks drifting with the wind, two layers crossing so the
  // pattern keeps changing instead of just sliding
  float vis0 = smoothstep(10.0, 3.0, footprint);
  vec3 s0 = noised(vec2(p.x * 0.012, p.y * 0.045) + vec2(t * 0.035, t * 0.012));
  vec3 s1 = noised(vec2(p.x * 0.02, p.y * 0.07) - vec2(t * 0.025, -t * 0.03) + 7.0);
  float streak = smoothstep(0.3, 0.85, (s0.x + s1.x) * 0.35 + 0.5) * vis0;
  col *= 0.9 + 0.25 * streak;

  float warp = noised(p * 0.02).x * 5.0;
  vec2 g = swell(p, t, warp, footprint);
  // Fine chop when close
  float vis2 = smoothstep(0.3, 0.06, footprint);
  if (vis2 > 0.0) {
    vec3 r1 = noised(p * 1.1 + vec2(t * 0.35, -t * 0.22));
    vec3 r2 = noised(p * 2.3 - vec2(t * 0.28, t * 0.4) + 3.0);
    g += (r1.yz * 1.1 + r2.yz * 2.3 * 0.5) * 0.05 * vis2;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  // Whitecaps on the swell crests, near zoom only
  float capVis = smoothstep(0.5, 0.15, footprint);
  if (capVis > 0.0) {
    float crest = cos(dot(SWELL_D1, p) * SWELL_K1 - t * 1.7 + warp * 0.7);
    float n = noised(p * 0.5 + vec2(t * 0.2, 0.0)).x;
    float cap = smoothstep(0.88, 1.0, crest) * smoothstep(0.45, 0.75, n) * smoothstep(1.5, 4.0, depth);
    col = mix(col, srgb(220.0, 236.0, 240.0), cap * 0.6 * capVis);
  }

  // Breakers rolling towards the shore, and the surf line itself
  float shoreVis = smoothstep(0.7, 0.15, footprint);
  vec3 foamCol = srgb(222.0, 240.0, 234.0);
  if (shoreVis > 0.0 && depth < 2.5) {
    float phase = depth * 5.5 + t * 1.6 + noised(p * 0.15).x * 2.5;
    float br = smoothstep(0.7, 1.0, sin(phase)) * (1.0 - smoothstep(0.3, 2.2, depth));
    br *= 0.55 + 0.45 * noised(p * 0.7 + vec2(0.0, t * 0.1)).x;
    col = mix(col, foamCol, clamp(br, 0.0, 1.0) * 0.7 * shoreVis);
  }
  float surfW = 0.12 + 0.09 * sin(t * 1.4 + noised(p * 0.3).x * 4.0);
  float surf = 1.0 - smoothstep(0.0, surfW, depth);
  col = mix(col, foamCol, surf * 0.8);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * smoothstep(4.0, 0.5, footprint);
  return col * (0.55 + 0.5 * diff) + sun * spec * 0.12;
}

// Ripples smeared along the current: averaging samples along the flow
// direction stretches them into streaks without a global rotation.
vec3 currentPattern(vec2 q, vec2 dir) {
  vec2 s = dir * 0.35;
  vec3 a = (noised(q * 1.4) + noised((q + s) * 1.4) + noised((q - s) * 1.4)) / 3.0;
  vec3 b = noised(q * 3.7 + 5.0) * 0.5;
  return a * 1.5 + b;
}

// Rivers and lakes. Ripples are advected along the stored flow direction with
// the usual two-phase flow-map trick, so the water visibly runs downstream.
vec3 shadeInlandWater(vec2 p, vec4 fl, float wm, float footprint, vec3 V, vec3 L, vec3 sun) {
  float t = uTime;
  float speed = mix(1.0, 2.2, fl.w);
  const float PERIOD = 1.8;
  float ph0 = fract(t / PERIOD);
  float ph1 = fract(t / PERIOD + 0.5);
  float blend = abs(1.0 - 2.0 * ph0);
  vec2 drift = vec2(t * 0.06, t * 0.04); // lakes stir slowly
  vec2 q0 = p - fl.xy * speed * PERIOD * ph0 + drift;
  vec2 q1 = p - fl.xy * speed * PERIOD * ph1 + drift + 17.0;
  vec3 r = mix(currentPattern(q0, fl.xy), currentPattern(q1, fl.xy), blend);
  float vis = smoothstep(0.5, 0.08, footprint);
  vec2 g = r.yz * 0.12 * vis;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  vec3 shallow = srgb(88.0, 170.0, 184.0);
  vec3 deep = srgb(36.0, 96.0, 150.0);
  vec3 col = mix(shallow, deep, smoothstep(0.55, 0.95, wm));
  // Foam streaks riding the current
  float streak = smoothstep(0.55, 0.95, r.x * 0.5 + 0.5) * vis * (0.35 + 0.65 * fl.w) * length(fl.xy);
  col = mix(col, srgb(210.0, 236.0, 238.0), streak * 0.7);
  col *= 0.92 + 0.12 * r.x * vis;
  // Light rim along the banks
  float rim = 1.0 - smoothstep(0.5, 0.58, wm);
  col = mix(col, srgb(150.0, 200.0, 196.0), rim * 0.6);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 50.0) * vis;
  return col * (0.6 + 0.45 * diff) + sun * spec * 0.35;
}

void main() {
  vec2 p = vWorld.xz;
  vec3 V = normalize(cameraPosition - vWorld);
  float footprint = max(length(fwidth(p)), 1e-4);
  float octaves = octavesFor(footprint);
  vec3 L = normalize(uSunDir);
  vec3 sun = srgb(255.0, 246.0, 225.0);

  vec4 m = macroAt(p);
  vec4 fl = flowAt(p);
  // Macro gradients by central differences on the smooth bicubic field
  const float e = 0.5;
  vec4 mx = macroAt(p + vec2(e, 0.0)) - macroAt(p - vec2(e, 0.0));
  vec4 mz = macroAt(p + vec2(0.0, e)) - macroAt(p - vec2(0.0, e));
  vec2 grad = vec2(mx.r, mz.r) / (2.0 * e);
  vec2 forestGrad = vec2(mx.a, mz.a) / (2.0 * e);
  float desert = desertMask(fl.b, p);
  float h = m.r;
  if (m.r > -8.0) {
    vec3 d = detail(p, octaves, m.b) * detailAmp(m, desert);
    h += d.x;
    grad += d.yz;
  }

  vec3 color;
  if (h < 0.0) {
    color = shadeSea(p, -h, footprint, V, L, sun);
  } else {
    if (desert > 0.0) grad += dunes(p, footprint).yz * desert;
    vec3 N = normalize(vec3(-grad.x * uHeightScale, 1.0, -grad.y * uHeightScale));
    float slope = 1.0 - N.y;

    // Grassland: broad tonal patches
    float patchN = noised(p * 0.035).x * 0.5 + 0.5;
    float patchN2 = noised(p * 0.12 + 31.0).x * 0.5 + 0.5;
    vec3 grassYellow = srgb(178.0, 186.0, 78.0);
    vec3 grassLight = srgb(140.0, 176.0, 62.0);
    vec3 grassMid = srgb(100.0, 146.0, 50.0);
    vec3 albedo = mix(grassLight, grassYellow, smoothstep(0.5, 0.85, patchN));
    albedo = mix(albedo, grassMid, smoothstep(0.45, 0.85, patchN2) * 0.6 + smoothstep(4.0, 12.0, h) * 0.4);

    // Steppe fringe and sand sea
    float arid = smoothstep(0.1, 0.45, fl.b);
    albedo = mix(albedo, srgb(186.0, 172.0, 96.0), arid * 0.7);
    if (desert > 0.0) {
      float sandN = noised(p * 0.08 + 4.0).x * 0.5 + 0.5;
      vec3 sand = mix(srgb(232.0, 200.0, 140.0), srgb(214.0, 166.0, 104.0), sandN);
      albedo = mix(albedo, sand, desert);
    }

    // Rock on steep ground and mountain crests (red sandstone in the desert)
    float rockN = noised(p * 0.6).x * 0.5 + 0.5;
    vec3 rock = mix(srgb(138.0, 118.0, 86.0), srgb(104.0, 94.0, 78.0), rockN);
    rock = mix(rock, mix(srgb(176.0, 108.0, 70.0), srgb(140.0, 84.0, 58.0), rockN), arid);
    float rockiness = clamp(smoothstep(0.18, 0.5, slope) * (0.4 + m.b) + smoothstep(0.35, 0.9, m.b) * 0.5, 0.0, 1.0);
    albedo = mix(albedo, rock, rockiness);

    // Snow caps: lower on north-facing slopes, rock shows through on cliffs
    float snowLine = 14.5 + noised(p * 0.04 - 9.0).x * 2.0 + N.z * 3.0;
    float snow = smoothstep(snowLine, snowLine + 1.0, h) * (1.0 - smoothstep(0.55, 0.85, slope)) * (1.0 - desert);
    albedo = mix(albedo, srgb(242.0, 245.0, 250.0), snow);

    // Forest canopy
    vec2 forest = forestMask(m, p);
    float fm = forest.x;
    if (fm > 0.0 && uTexturedForest > 0.5) {
      // Flat, mottled understory; the cutout cards supply the crown silhouettes.
      float mottling = noised(p * 0.8).x * 0.5 + 0.5;
      vec3 floorColor = mix(srgb(47.0, 68.0, 30.0), srgb(67.0, 91.0, 39.0), mottling);
      floorColor *= mix(1.3, 0.65, uForestShade);
      albedo = mix(albedo, floorColor, fm * sqrt(uForestDensity) * 0.88);
    }
    if (fm > 0.0 && uTexturedForest < 0.5) {
      Canopy c = canopy(p, forest, footprint);
      vec3 dark = srgb(30.0, 70.0, 30.0);
      vec3 mid = srgb(50.0, 102.0, 36.0);
      vec3 light = srgb(98.0, 140.0, 44.0);
      vec3 conifer = srgb(30.0, 74.0, 52.0);
      vec3 col = mix(mid, dark, patchN2 * 0.6);
      col = mix(col, light, smoothstep(0.65, 1.0, c.tone) * 0.6);
      col = mix(col, conifer, clamp(smoothstep(0.3, 0.0, c.tone) * 0.7 + smoothstep(8.0, 14.0, h) * 0.5, 0.0, 1.0));
      col *= c.ao;
      vec2 cg = c.g + forestGrad * 0.4 * forest.y;
      vec3 Nc = normalize(vec3(-(grad.x + cg.x) * uHeightScale, 1.0, -(grad.y + cg.y) * uHeightScale));
      // Between crowns: dark understory inside the wood, shaded grass at its edge
      vec3 gapCol = mix(srgb(22.0, 44.0, 24.0), albedo * 0.6, 1.0 - smoothstep(0.3, 0.8, fm));
      col = mix(col, gapCol, c.gap);
      Nc = normalize(mix(Nc, N, c.gap));
      float cover = smoothstep(0.0, 0.25, fm);
      albedo = mix(albedo, col, cover);
      N = normalize(mix(N, Nc, cover));
    }
    // Lone trees dotting open country, once they span a few pixels
    float treeVis = smoothstep(0.12, 0.05, footprint) * (1.0 - fm);
    if (treeVis > 0.0 && uTexturedForest < 0.5) {
      float loose = (0.04 + smoothstep(0.15, 0.38, m.a) * 0.2)
        * (1.0 - rockiness) * (1.0 - desert) * (1.0 - snow);
      const float LONE_FREQ = 1.3;
      Blobs sh = blobs(p + L.xz * 0.2, LONE_FREQ, 0.45, loose);
      albedo *= 1.0 - step(1e-4, sh.h) * 0.35 * treeVis;
      Blobs t = blobs(p, LONE_FREQ, 0.45, loose);
      if (t.h > 0.0) {
        vec3 crown = mix(srgb(56.0, 108.0, 38.0), srgb(40.0, 84.0, 34.0), t.id) * mix(0.6, 1.15, t.rel);
        albedo = mix(albedo, crown, treeVis);
        N = normalize(mix(N, normalize(N + vec3(-t.g.x, 0.0, -t.g.y)), treeVis));
      }
    }

    // Shade cast by woods onto open ground beside them
    float woodShadow = clamp(dot(forestGrad, L.xz) * 2.5, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.3, fm));
    albedo *= 1.0 - woodShadow * mix(0.35, uForestShade * uForestDensity * 0.5, uTexturedForest);

    // Beaches
    float beachN = noised(p * 2.0).x * 0.05;
    float beach = (1.0 - smoothstep(0.08, 0.2, h + beachN)) * (1.0 - smoothstep(0.1, 0.3, slope));
    albedo = mix(albedo, srgb(218.0, 204.0, 146.0), beach * 0.85);

    // Rivers and lakes, with banks frayed by noise once close
    float wm = m.g + noised(p * 1.3).x * 0.05 * smoothstep(0.6, 0.1, footprint);
    // Anti-aliased at any zoom: the edge is one pixel wide
    float wEdge = max(fwidth(wm) * 0.75, 1e-4);
    float water = smoothstep(0.5 - wEdge, 0.5 + wEdge, wm);
    // Green ribbons along rivers crossing dry land
    albedo = mix(albedo, srgb(112.0, 150.0, 52.0), smoothstep(0.05, 0.35, wm) * arid * 0.85);
    float bank = smoothstep(0.32, 0.47, wm) * (1.0 - water);
    albedo = mix(albedo, albedo * mix(vec3(0.75), vec3(0.9, 0.85, 0.7), arid), bank);

    float diff = max(dot(N, L), 0.0);
    vec3 ambient = vec3(0.92, 0.96, 1.08) * (0.38 + 0.12 * N.y);
    color = albedo * (ambient + diff * 0.95 * sun);
    // Glint on snow
    color += sun * pow(max(dot(reflect(-L, N), V), 0.0), 20.0) * 0.12 * snow;

    if (water > 0.0) {
      color = mix(color, shadeInlandWater(p, fl, wm, footprint, V, L, sun), water);
    }
  }

  float dist = length(cameraPosition - vWorld);
  color = mix(color, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  // Linear in offscreen targets, sRGB on screen, matching the forest material.
  fragColor = linearToOutputTexel(vec4(color, 1.0));
}
`
