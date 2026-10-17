import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import './cake.css'

/* ------------------------------------------------------------------ */
/*  Heart outline + maths                                              */
/* ------------------------------------------------------------------ */
function heartShape() {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.45)
  shape.bezierCurveTo(-0.25, 0.9, -1.15, 0.8, -1.15, 0.15)
  shape.bezierCurveTo(-1.15, -0.35, -0.6, -0.8, 0, -1.35)
  shape.bezierCurveTo(0.6, -0.8, 1.15, -0.35, 1.15, 0.15)
  shape.bezierCurveTo(1.15, 0.8, 0.25, 0.9, 0, 0.45)
  return shape
}

const CENTER = { x: 0, y: -0.3 }
const SLICES = 7
const DELTA = (Math.PI * 2) / SLICES
const START = -Math.PI / 2 - DELTA / 2 // slice 0 is the tip of the heart
const SCALE = 1.25
const TWO_PI = Math.PI * 2
export const TOTAL_CUTS = SLICES - 1
const CUT_ORDER = [1, 6, 2, 5, 3, 4, 0] // slice 0 (the tip) is the last bit, with the letter

const OUTLINE = heartShape().getPoints(60).map((p) => ({ x: p.x - CENTER.x, y: p.y - CENTER.y }))
const radiusCache = new Map()
function radiusAt(theta) {
  const key = Math.round(theta * 1e5)
  if (radiusCache.has(key)) return radiusCache.get(key)
  const dx = Math.cos(theta)
  const dy = Math.sin(theta)
  let best = 0
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const a = OUTLINE[i]
    const b = OUTLINE[i + 1]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = (a.x * ey - a.y * ex) / den
    const s = (a.x * dy - a.y * dx) / den
    if (t > 0 && s >= 0 && s <= 1 && t > best) best = t
  }
  radiusCache.set(key, best)
  return best
}

const TIERS = [
  { s: 1, z: 0, h1: 0.2, hf: 0.05, h2: 0.2 },
  { s: 0.62, z: 0.5, h1: 0.17, hf: 0.04, h2: 0.17 },
]
const tierTop = (t) => t.z + t.h1 + t.hf + t.h2 // where the icing cap starts
const TOP_Z = tierTop(TIERS[1]) + 0.08

const rnd = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a, b, t) => a + (b - a) * t

/* ------------------------------------------------------------------ */
/*  Geometry builders (built once, shared by every cake)               */
/* ------------------------------------------------------------------ */
function wedgeShape(a0, a1, s, steps = 16) {
  const pts = [new THREE.Vector2(0, 0)]
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps
    const r = radiusAt(a) * s
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r))
  }
  return new THREE.Shape(pts)
}

function slab(i, s, z, depth, bevel = 0) {
  const shape = wedgeShape(START + i * DELTA, START + (i + 1) * DELTA, s)
  const opts = bevel
    ? { depth, steps: 1, bevelEnabled: true, bevelSegments: 4, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel }
    : { depth, steps: 1, bevelEnabled: false }
  const g = new THREE.ExtrudeGeometry(shape, opts)
  g.translate(0, 0, z + bevel)
  return g
}

function ribbon(i, s, zTop, zBot, push, steps = 48) {
  const pos = []
  const idx = []
  for (let k = 0; k <= steps; k++) {
    const a = START + (i + k / steps) * DELTA
    const r = radiusAt(a) * s + push
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    const zb = typeof zBot === 'function' ? zBot(a) : zBot
    pos.push(x, y, zTop, x, y, zb)
  }
  for (let k = 0; k < steps; k++) {
    const q = k * 2
    idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const dripLen = (a, s) =>
  s * (0.04 + 0.2 * Math.pow(0.5 + 0.5 * Math.sin(a * 11 + 1.3), 3) * (0.7 + 0.3 * Math.sin(a * 4 + 0.6)))

let GEOS = null
function getGeos() {
  if (GEOS) return GEOS
  GEOS = Array.from({ length: SLICES }, (_, i) =>
    TIERS.map((t) => {
      const capZ = tierTop(t)
      return {
        base: slab(i, t.s, t.z, t.h1),
        fill: slab(i, t.s * 1.012, t.z + t.h1, t.hf),
        upper: slab(i, t.s, t.z + t.h1 + t.hf, t.h2),
        cap: slab(i, t.s, capZ, 0.04, 0.02),
        rim: ribbon(i, t.s, capZ + 0.07, capZ - 0.06, 0.022),
        baseBand: ribbon(i, t.s, t.z + 0.09, t.z, 0.02),
        drip: ribbon(i, t.s, capZ + 0.05, (a) => capZ - dripLen(a, t.s), 0.02),
      }
    }),
  )
  return GEOS
}

const centered = (g, s) => {
  g.computeBoundingBox()
  const b = g.boundingBox
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0)
  g.scale(s, s, s)
  return g
}

let SHARED = null
function shared() {
  if (SHARED) return SHARED
  const heart3d = new THREE.ExtrudeGeometry(heartShape(), {
    depth: 0.35, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.12, bevelSegments: 4,
  })
  heart3d.computeBoundingBox()
  {
    const b = heart3d.boundingBox
    heart3d.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
    heart3d.scale(0.085, 0.085, 0.085)
  }
  const rosetteBase = new THREE.SphereGeometry(0.07, 16, 10)
  rosetteBase.scale(1, 1, 0.55)
  const star = new THREE.ConeGeometry(0.06, 0.11, 8, 1)
  star.translate(0, 0.055, 0)
  const shell = new THREE.SphereGeometry(0.05, 12, 8)
  shell.scale(1, 1, 0.8)
  const blade = new THREE.Shape([
    new THREE.Vector2(-0.4, -0.14), new THREE.Vector2(0.4, -0.14), new THREE.Vector2(0.4, 0.14),
    new THREE.Vector2(-0.2, 0.14), new THREE.Vector2(-0.4, -0.14),
  ])
  const bladeGeo = new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: false })
  bladeGeo.translate(0, 0, -0.006)
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, ...extra })
  const phys = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8, ...extra })
  SHARED = {
    heart3d,
    flatHeart: centered(new THREE.ShapeGeometry(heartShape()), 0.075),
    rosetteBase,
    star,
    shell,
    dot: new THREE.SphereGeometry(0.042, 14, 10),
    pearl: new THREE.SphereGeometry(0.035, 14, 10),
    capsule: new THREE.CapsuleGeometry(0.011, 0.05, 4, 8),
    berry: new THREE.SphereGeometry(0.07, 18, 14),
    leaf: (() => { const g = new THREE.SphereGeometry(0.03, 8, 6); g.scale(1.4, 1, 0.4); return g })(),
    candle: new THREE.CylinderGeometry(0.028, 0.028, 0.32, 14),
    flame: new THREE.SphereGeometry(0.04, 12, 10),
    glow: new THREE.SphereGeometry(0.09, 12, 10),
    blade: bladeGeo,
    handle: new THREE.BoxGeometry(0.42, 0.07, 0.05),
    envBody: new THREE.BoxGeometry(0.95, 0.62, 0.03),
    envFlap: (() => {
      const s = new THREE.Shape([new THREE.Vector2(-0.475, 0.31), new THREE.Vector2(0.475, 0.31), new THREE.Vector2(0, -0.08)])
      return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false })
    })(),
    envSeal: centered(new THREE.ShapeGeometry(heartShape()), 0.065),
    plate: new THREE.CylinderGeometry(1.95, 2.05, 0.06, 64),
    plateRing: new THREE.TorusGeometry(1.85, 0.025, 12, 80),
    pinkHeart: phys('#ff7aa8', { emissive: '#ff7aa8', emissiveIntensity: 0.12 }),
    berryMat: phys('#d12a73', { roughness: 0.2 }),
    leafMat: std('#62c486'),
    candleMat: std('#f3dcff'),
    flameMat: new THREE.MeshBasicMaterial({ color: '#ffd27a' }),
    glowMat: new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.25, depthWrite: false }),
    bladeMat: new THREE.MeshStandardMaterial({ color: '#e9e6f2', metalness: 0.95, roughness: 0.18 }),
    handleMat: std('#8a5ad6', { roughness: 0.3 }),
    plateMat: new THREE.MeshPhysicalMaterial({ color: '#efe3ff', roughness: 0.3, clearcoat: 0.6 }),
    plateRingMat: new THREE.MeshStandardMaterial({ color: '#c9a7ff', roughness: 0.3, metalness: 0.4 }),
    paper: new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.6 }),
    flapMat: new THREE.MeshStandardMaterial({ color: '#ead9ff', roughness: 0.6 }),
    sealMat: new THREE.MeshStandardMaterial({ color: '#ff6fa8', roughness: 0.3, emissive: '#ff6fa8', emissiveIntensity: 0.25 }),
    sprinkle: ['#ff9ecb', '#fff2a8', '#9fe7ff', '#c9a8ff', '#ffffff'].map((c) => std(c, { roughness: 0.4 })),
  }
  return SHARED
}

function useMats(cakeColor, icingColor) {
  return useMemo(() => {
    const cake = new THREE.Color(cakeColor)
    const filling = cake.clone().lerp(new THREE.Color('#fff4fb'), 0.62)
    const icing = new THREE.MeshPhysicalMaterial({
      color: icingColor, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25,
      emissive: icingColor, emissiveIntensity: 0.06,
    })
    const band = icing.clone()
    band.side = THREE.DoubleSide
    const star = icing.clone()
    star.flatShading = true
    return {
      sponge: new THREE.MeshStandardMaterial({ color: cake, roughness: 0.62 }),
      filling: new THREE.MeshStandardMaterial({ color: filling, roughness: 0.4 }),
      icing, band, star,
      pearl: new THREE.MeshPhysicalMaterial({ color: '#fff7fb', roughness: 0.15, metalness: 0.15, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.08 }),
    }
  }, [cakeColor, icingColor])
}

/* ------------------------------------------------------------------ */
/*  Evenly spaced points around a tier edge, grouped by slice          */
/* ------------------------------------------------------------------ */
const ringCache = new Map()
function ring(s, count, phase = 0) {
  const key = `${s}|${count}|${phase}`
  if (ringCache.has(key)) return ringCache.get(key)
  const M = 480
  const pts = []
  const cum = [0]
  for (let m = 0; m <= M; m++) {
    const a = START + (m / M) * TWO_PI
    const r = radiusAt(a) * s
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, a })
    if (m) cum.push(cum[m - 1] + Math.hypot(pts[m].x - pts[m - 1].x, pts[m].y - pts[m - 1].y))
  }
  const total = cum[M]
  const bySlice = Array.from({ length: SLICES }, () => [])
  for (let j = 0; j < count; j++) {
    const target = (((j + 0.5 + phase) / count) * total) % total
    let m = 0
    while (m < M - 1 && cum[m + 1] < target) m++
    const f = (target - cum[m]) / (cum[m + 1] - cum[m] || 1)
    const p0 = pts[m]
    const p1 = pts[m + 1]
    const a = lerp(p0.a, p1.a, f)
    const tx = p1.x - p0.x
    const ty = p1.y - p0.y
    const len = Math.hypot(tx, ty) || 1
    const slice = Math.min(SLICES - 1, Math.floor(((a - START) / TWO_PI) * SLICES))
    bySlice[slice].push({ x: lerp(p0.x, p1.x, f), y: lerp(p0.y, p1.y, f), nx: ty / len, ny: -tx / len, a })
  }
  ringCache.set(key, bySlice)
  return bySlice
}

const facing = (p) => {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-p.ny, p.nx, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(p.nx, p.ny, 0),
  )
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/* ------------------------------------------------------------------ */
/*  Icing decorations (per slice, so they travel with the slice)       */
/* ------------------------------------------------------------------ */
function Decor({ design, slice, mats }) {
  const S = shared()
  const items = []
  TIERS.forEach((t, ti) => {
    const H = tierTop(t) - t.z
    const topZ = tierTop(t) + 0.08

    if (design === 'ruffled') {
      ring(t.s * 0.93, Math.round(34 * t.s) + 4)[slice].forEach((p, j) =>
        items.push(
          <group key={`ru${ti}-${j}`} position={[p.x, p.y, topZ - 0.01]} scale={0.8 + 0.35 * t.s}>
            <mesh geometry={S.rosetteBase} material={mats.icing} />
            <mesh geometry={S.star} material={mats.star} position={[0, 0, 0.03]} rotation={[Math.PI / 2, j * 1.7, 0]} />
          </group>,
        ),
      )
      ring(t.s, Math.round(30 * t.s) + 4)[slice].forEach((p, j) =>
        items.push(<mesh key={`rb${ti}-${j}`} geometry={S.shell} material={mats.icing} position={[p.x + p.nx * 0.012, p.y + p.ny * 0.012, t.z + 0.06]} />),
      )
    }

    if (design === 'dots') {
      const n = Math.round(24 * t.s) + 4
      ;[[0.28, 0], [0.68, 0.5]].forEach(([f, ph], r) =>
        ring(t.s, n, ph)[slice].forEach((p, j) =>
          items.push(<mesh key={`d${ti}-${r}-${j}`} geometry={S.dot} material={mats.icing} position={[p.x + p.nx * 0.006, p.y + p.ny * 0.006, t.z + H * f]} />),
        ),
      )
      const a0 = START + slice * DELTA
      for (let q = 0; q < (ti === 0 ? 9 : 7); q++) {
        const seed = slice * 131 + ti * 17 + q * 7.3
        const a = a0 + DELTA * (0.05 + 0.9 * rnd(seed))
        const lo = ti === 0 ? 0.72 : 0.12
        const hi = ti === 0 ? 0.9 : 0.88
        const rho = radiusAt(a) * t.s * (lo + (hi - lo) * rnd(seed + 3))
        items.push(
          <group key={`sp${ti}-${q}`} position={[Math.cos(a) * rho, Math.sin(a) * rho, topZ + 0.012]} rotation={[0, 0, rnd(seed + 9) * Math.PI]}>
            <mesh geometry={S.capsule} material={S.sprinkle[Math.floor(rnd(seed + 5) * 5)]} rotation={[0, 0, Math.PI / 2]} />
          </group>,
        )
      }
    }

    if (design === 'hearts') {
      ring(t.s * 0.95, Math.round(40 * t.s) + 4)[slice].forEach((p, j) =>
        items.push(<mesh key={`pe${ti}-${j}`} geometry={S.pearl} material={mats.pearl} position={[p.x, p.y, topZ + 0.005]} />),
      )
      ring(t.s, Math.round(8 * t.s) + 3)[slice].forEach((p, j) =>
        items.push(
          <mesh key={`fh${ti}-${j}`} geometry={S.flatHeart} material={mats.band} quaternion={facing(p)}
            position={[p.x + p.nx * 0.012, p.y + p.ny * 0.012, t.z + H * 0.5]} />,
        ),
      )
    }
  })
  return <>{items}</>
}

function Flame({ seed, position }) {
  const S = shared()
  const ref = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed * 2
    if (ref.current) ref.current.scale.set(1, 1, 1.35 + Math.sin(t) * 0.15 + Math.sin(t * 2.3) * 0.08)
  })
  return (
    <group position={position}>
      <mesh ref={ref} geometry={S.flame} material={S.flameMat} />
      <mesh geometry={S.glow} material={S.glowMat} />
    </group>
  )
}

function Toppers({ slice, toppers }) {
  const S = shared()
  const mid = START + (slice + 0.5) * DELTA
  const rTop = radiusAt(mid) * TIERS[1].s
  const rBot = radiusAt(mid) * TIERS[0].s
  const botZ = tierTop(TIERS[0]) + 0.08
  const at = (rho, z) => [Math.cos(mid) * rho, Math.sin(mid) * rho, z]
  const out = []
  if (toppers.berries) {
    const berry = (key, pos) => (
      <group key={key} position={pos}>
        <mesh geometry={S.berry} material={S.berryMat} />
        <mesh geometry={S.leaf} material={S.leafMat} position={[0, 0, 0.06]} />
      </group>
    )
    out.push(berry('b1', at(rBot * 0.84, botZ + 0.055)))
    if (slice >= 2 && slice <= 5) out.push(berry('b2', at(rTop * 0.78, TOP_Z + 0.055)))
  }
  if (toppers.hearts && [1, 2, 5, 6].includes(slice)) {
    out.push(
      <group key="h" position={at(rTop * 0.5, TOP_Z + 0.01)} rotation={[0, 0, mid + Math.PI / 2]}>
        <mesh geometry={S.heart3d} material={S.pinkHeart} rotation={[Math.PI / 2, 0, 0]} />
      </group>,
    )
  }
  if (toppers.candles && (slice === 3 || slice === 4)) {
    out.push(
      <group key="c" position={at(rTop * 0.3, TOP_Z)}>
        <mesh geometry={S.candle} material={S.candleMat} position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]} />
        <Flame seed={slice} position={[0, 0, 0.36]} />
      </group>,
    )
  }
  return <>{out}</>
}

function CakeSlice({ i, mats, design, toppers, setRef }) {
  const geos = getGeos()[i]
  return (
    <group ref={setRef}>
      {TIERS.map((t, ti) => {
        const G = geos[ti]
        return (
          <group key={ti}>
            <mesh geometry={G.base} material={mats.sponge} />
            <mesh geometry={G.fill} material={mats.filling} />
            <mesh geometry={G.upper} material={mats.sponge} />
            <mesh geometry={G.cap} material={mats.icing} />
            {design === 'classic' && (
              <>
                <mesh geometry={G.rim} material={mats.band} />
                <mesh geometry={G.baseBand} material={mats.band} />
              </>
            )}
            {design === 'drip' && <mesh geometry={G.drip} material={mats.band} />}
          </group>
        )
      })}
      <Decor design={design} slice={i} mats={mats} />
      <Toppers slice={i} toppers={toppers} />
    </group>
  )
}

function CakeBody({ settings, sliceRefs }) {
  const mats = useMats(settings.cakeColor, settings.icingColor)
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} dispose={null}>
      {Array.from({ length: SLICES }, (_, i) => (
        <CakeSlice key={i} i={i} mats={mats} design={settings.design} toppers={settings.toppers}
          setRef={(el) => { if (sliceRefs) sliceRefs.current[i] = el }} />
      ))}
    </group>
  )
}

function Plate() {
  const S = shared()
  return (
    <group dispose={null}>
      <mesh geometry={S.plate} material={S.plateMat} position={[0, -0.03, 0]} />
      <mesh geometry={S.plateRing} material={S.plateRingMat} position={[0, 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} />
      <ContactShadows position={[0, -0.065, 0]} opacity={0.45} blur={2.6} scale={9} far={2.5} />
    </group>
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={1.1} color="#efdfff" />
      <directionalLight position={[3, 6, 4]} intensity={2.2} color="#fff1dc" />
      <pointLight position={[-4, 2.5, -2]} intensity={14} distance={10} color="#b889ff" />
      <Environment preset="city" />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Customiser scene (whole cake, drag to rotate)                      */
/* ------------------------------------------------------------------ */
export function CakeScene({ cakeColor, icingColor, design, toppers }) {
  const settings = { cakeColor, icingColor, design, toppers }
  return (
    <Canvas camera={{ position: [0, 3.3, 5.2], fov: 32 }} dpr={[1, 1.75]} onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}>
      <Lights />
      <group scale={SCALE}>
        <CakeBody settings={settings} />
      </group>
      <Plate />
      <Sparkles count={35} position={[0, 1, 0]} scale={4.5} size={2} speed={0.35} color="#ffe6fb" />
      <OrbitControls enablePan={false} minDistance={4} maxDistance={7.5} target={[0, 0.5, 0]} autoRotate autoRotateSpeed={1.4} maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  )
}

/* ------------------------------------------------------------------ */
/*  Slicing scene                                                      */
/* ------------------------------------------------------------------ */
const yawFor = (idx) => {
  const mid = START + (idx + 0.5) * DELTA
  return Math.atan2(-Math.cos(mid), -Math.sin(mid))
}
const seamDir = (theta, yaw) => {
  const x = Math.cos(theta)
  const z = -Math.sin(theta)
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]
}

function Burst({ pos, t0, onDone }) {
  const S = shared()
  const refs = useRef([])
  const done = useRef(false)
  const hearts = useMemo(
    () => Array.from({ length: 10 }, (_, i) => ({
      angle: (i / 10) * TWO_PI + rnd(i) * 0.5,
      speed: 0.7 + rnd(i + 4) * 0.8,
      size: 0.7 + rnd(i + 9) * 0.7,
      mat: new THREE.MeshBasicMaterial({ color: ['#ff9ecb', '#ffffff', '#d9b3ff'][i % 3], transparent: true, depthWrite: false }),
    })),
    [],
  )
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime - t0
    refs.current.forEach((m, i) => {
      if (!m) return
      const h = hearts[i]
      m.position.set(pos[0] + Math.cos(h.angle) * h.speed * t, pos[1] + Math.sin(h.angle) * h.speed * t * 0.6 + t * 0.6, pos[2] + Math.sin(h.angle) * 0.3 * t)
      m.quaternion.copy(camera.quaternion)
      m.scale.setScalar(h.size * Math.max(0.001, 1 - t / 1.3))
      h.mat.opacity = Math.max(0, 1 - t / 1.3)
    })
    if (t > 1.4 && !done.current) { done.current = true; onDone() }
  })
  return (
    <group>
      {hearts.map((h, i) => <mesh key={i} ref={(el) => { refs.current[i] = el }} geometry={S.flatHeart} material={h.mat} />)}
    </group>
  )
}

function Envelope({ onOpen }) {
  const S = shared()
  const ref = useRef()
  const halo = useRef()
  const born = useRef(null)
  useFrame(({ clock }) => {
    if (born.current == null) born.current = clock.elapsedTime
    const t = clock.elapsedTime - born.current
    const e = 1 - Math.pow(1 - clamp01(t / 1.2), 3)
    if (ref.current) {
      ref.current.position.y = 0.75 + e * 0.9 + Math.sin(clock.elapsedTime * 2) * 0.05 * e
      ref.current.scale.setScalar(0.001 + e)
      ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.5) * 0.05
    }
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.08)
  })
  return (
    <group
      ref={ref}
      position={[0, 0.75, 0.62]}
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <group rotation={[-0.35, 0, 0]}>
        <mesh ref={halo} position={[0, 0, -0.04]}>
          <circleGeometry args={[0.85, 40]} />
          <meshBasicMaterial color="#ffd6ff" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh geometry={S.envBody} material={S.paper} />
        <mesh geometry={S.envFlap} material={S.flapMat} position={[0, 0, 0.016]} />
        <mesh geometry={S.envSeal} material={S.sealMat} position={[0, -0.03, 0.04]} />
      </group>
      <Sparkles count={18} scale={[1.6, 1.2, 0.8]} size={3} speed={0.6} color="#ffe6fb" />
      <pointLight color="#ff9ecb" intensity={2.5} distance={3} position={[0, 0, 0.5]} />
    </group>
  )
}

function SliceStage({ settings, cutCount, onCakeClick, onLetter, onLetterReady }) {
  const S = shared()
  const clock = useThree((s) => s.clock)
  const sliceRefs = useRef([])
  const yawGroup = useRef()
  const knife = useRef()
  const starts = useRef([])
  const yawVal = useRef(0)
  const burstFired = useRef([])
  const letterFlag = useRef(false)
  const [bursts, setBursts] = useState([])
  const [letterReady, setLetterReady] = useState(false)

  useEffect(() => {
    for (let k = starts.current.length; k < cutCount; k++) starts.current[k] = clock.elapsedTime
  }, [cutCount, clock])

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime
    const n = starts.current.length
    const k = n - 1

    /* turntable: face the slice being cut, then the next one */
    let target = 0
    if (k >= 0) {
      const ph = now - starts.current[k]
      target = yawFor(ph < 1.5 ? CUT_ORDER[k] : CUT_ORDER[k + 1] ?? 0)
    }
    let diff = (((target - yawVal.current + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI
    yawVal.current += diff * (1 - Math.exp(-8 * dt))
    if (yawGroup.current) yawGroup.current.rotation.y = yawVal.current

    /* slices that have been cut */
    for (let j = 0; j < n; j++) {
      const idx = CUT_ORDER[j]
      const g = sliceRefs.current[idx]
      if (!g) continue
      const p = clamp01((now - starts.current[j] - 1.3) / 0.8)
      if (p <= 0) continue
      const mid = START + (idx + 0.5) * DELTA
      const e = 1 - Math.pow(1 - p, 3)
      const dist = e * 1.2
      g.position.set(Math.cos(mid) * dist, Math.sin(mid) * dist, Math.sin(Math.min(1, p * 1.2) * Math.PI * 0.8) * 0.22)
      const sc = p < 0.55 ? 1 : Math.max(0.001, 1 - Math.pow((p - 0.55) / 0.45, 2))
      g.scale.setScalar(sc)
      g.visible = p < 1
      if (p > 0.85 && !burstFired.current[j]) {
        burstFired.current[j] = true
        const pos = [0, 0.85, (radiusAt(mid) * 0.5 + 1.1) * SCALE]
        setBursts((b) => [...b, { id: j, pos, t0: now }])
      }
    }

    /* the knife */
    const kn = knife.current
    if (kn) {
      const ph = k >= 0 ? now - starts.current[k] : 0
      if (k < 0 || ph < 0.12 || ph > 1.6) {
        kn.visible = false
      } else {
        const idx = CUT_ORDER[k]
        const mid = START + (idx + 0.5) * DELTA
        const thA = mid - DELTA / 2
        const thB = mid + DELTA / 2
        const C_IN = 0.45
        const Y_HI = TOP_Z * SCALE + 0.5
        const Y_LO = TOP_Z * SCALE - 0.28
        const cOut = (th) => radiusAt(th) * SCALE + 0.5
        let th = thA, c = cOut(thA), y = Y_HI
        if (ph < 0.35) { th = thA; c = cOut(thA); y = Y_HI }
        else if (ph < 0.8) { const e = ease(clamp01((ph - 0.35) / 0.45)); th = thA; c = lerp(cOut(thA), C_IN, e); y = lerp(Y_HI, Y_LO, e) }
        else if (ph < 0.95) { const e = ease((ph - 0.8) / 0.15); th = lerp(thA, thB, e); c = C_IN; y = Y_LO }
        else if (ph < 1.4) { const e = ease(clamp01((ph - 0.95) / 0.45)); th = thB; c = lerp(C_IN, cOut(thB), e); y = lerp(Y_LO, Y_HI, e) }
        else { th = thB; c = cOut(thB); y = Y_HI }
        const [dx, dz] = seamDir(th, yawVal.current)
        kn.visible = true
        kn.position.set(dx * c, y, dz * c)
        kn.rotation.y = Math.atan2(-dz, dx)
        const grow = clamp01((ph - 0.12) / 0.2) * (1 - clamp01((ph - 1.4) / 0.2))
        kn.scale.setScalar(Math.max(0.001, grow))
      }
    }

    /* the letter appears once the last cut has finished */
    if (!letterFlag.current && cutCount >= TOTAL_CUTS && starts.current[TOTAL_CUTS - 1] != null && now - starts.current[TOTAL_CUTS - 1] > 2.1) {
      letterFlag.current = true
      setLetterReady(true)
      onLetterReady?.()
    }
  })

  return (
    <>
      <Lights />
      <group
        ref={yawGroup}
        scale={SCALE}
        onClick={(e) => { e.stopPropagation(); onCakeClick?.() }}
      >
        <CakeBody settings={settings} sliceRefs={sliceRefs} />
      </group>

      <group ref={knife} visible={false}>
        <mesh geometry={S.blade} material={S.bladeMat} />
        <mesh geometry={S.handle} material={S.handleMat} position={[0.58, 0.1, 0]} />
      </group>

      {bursts.map((b) => (
        <Burst key={b.id} pos={b.pos} t0={b.t0} onDone={() => setBursts((list) => list.filter((x) => x.id !== b.id))} />
      ))}
      {letterReady && <Envelope onOpen={onLetter} />}
      <Plate />
      <Sparkles count={25} position={[0, 1, 0]} scale={5} size={2} speed={0.3} color="#ffe6fb" />
    </>
  )
}

export function SliceCake({ settings, cutCount, onCut, onLetter }) {
  const [busy, setBusy] = useState(false)
  const [letterReady, setLetterReady] = useState(false)
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])

  const handleCut = () => {
    if (busy || cutCount >= TOTAL_CUTS) return
    setBusy(true)
    onCut()
    timer.current = setTimeout(() => setBusy(false), 2300)
  }

  return (
    <div className="ck-slice-wrap">
      <Canvas camera={{ position: [0, 3.4, 5.4], fov: 32 }} dpr={[1, 1.75]} onCreated={({ camera }) => camera.lookAt(0, 0.45, 0)}>
        <SliceStage settings={settings} cutCount={cutCount} onCakeClick={handleCut} onLetter={onLetter} onLetterReady={() => setLetterReady(true)} />
      </Canvas>
      <div className="ck-actions">
        {cutCount < TOTAL_CUTS && (
          <button className="primary-button ck-cut-btn" disabled={busy} onClick={handleCut}>
            {busy ? 'Cutting…' : 'Cut a slice 🔪'}
          </button>
        )}
        {cutCount >= TOTAL_CUTS && !letterReady && <span className="ck-hint">Something is hiding inside…</span>}
        {letterReady && <span className="ck-hint ck-hint-glow">Tap the letter 💌</span>}
      </div>
    </div>
  )
}
