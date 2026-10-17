import { useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import './bouquet.css'

const rnd = (s) => {
  const x = Math.sin(s * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
const UP = new THREE.Vector3(0, 1, 0)
const A = new THREE.Vector3(0, -1.05, 0) // where every stem meets, down in the wrapping
const D = new THREE.Vector3(0, 0.55, 0) // centre of the flower dome
const ROSE_COLORS = ['#7c3fc0', '#9a5ce0', '#b585e6', '#5e2a93', '#c9a4ef', '#8a4bd0']

const PETAL = new THREE.SphereGeometry(0.06, 10, 8)
const BALL = new THREE.SphereGeometry(1, 12, 10)

/* ---------------------------- flowers ----------------------------- */
const ROSE_RINGS = [
  { n: 3, r: 0.012, tilt: 0.1, s: 0.55 },
  { n: 5, r: 0.03, tilt: 0.3, s: 0.75 },
  { n: 6, r: 0.05, tilt: 0.55, s: 0.9 },
  { n: 8, r: 0.072, tilt: 0.85, s: 1.05 },
  { n: 9, r: 0.092, tilt: 1.15, s: 1.15 },
]

function Rose({ color, size = 1 }) {
  const mats = useMemo(
    () => ROSE_RINGS.map((_, ri) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.62 + ri * 0.1), roughness: 0.45,
    })),
    [color],
  )
  return (
    <group scale={size}>
      <mesh geometry={BALL} scale={[0.045, 0.03, 0.045]} position={[0, -0.04, 0]}>
        <meshStandardMaterial color="#3f8a5d" roughness={0.6} />
      </mesh>
      {ROSE_RINGS.map((rg, ri) =>
        Array.from({ length: rg.n }, (_, k) => (
          <group key={`${ri}-${k}`} rotation={[0, (k / rg.n) * Math.PI * 2 + ri * 0.7, 0]}>
            <mesh
              geometry={PETAL}
              material={mats[ri]}
              position={[rg.r, 0.055 * rg.s, 0]}
              rotation={[0, 0, -rg.tilt]}
              scale={[0.3 * rg.s, rg.s, 0.95 * rg.s]}
            />
          </group>
        )),
      )}
    </group>
  )
}

function Aster({ color, seed }) {
  return (
    <group rotation={[0.2, seed, 0]}>
      <mesh geometry={BALL} scale={0.035} position={[0, 0.01, 0]}>
        <meshStandardMaterial color="#f5c542" roughness={0.5} />
      </mesh>
      {[0, 1].map((layer) =>
        Array.from({ length: 14 }, (_, k) => (
          <group key={`${layer}-${k}`} rotation={[0, (k / 14) * Math.PI * 2 + layer * 0.22, 0]}>
            <mesh geometry={PETAL} position={[0.07 + layer * 0.004, layer * -0.008, 0]} rotation={[0, 0, 0.18 - layer * 0.1]} scale={[1.05, 0.16, 0.38]}>
              <meshStandardMaterial color={layer ? '#c9a4ef' : color} roughness={0.5} />
            </mesh>
          </group>
        )),
      )}
    </group>
  )
}

function Lavender({ seed }) {
  const buds = useMemo(
    () => Array.from({ length: 13 }, (_, q) => ({
      y: 0.02 + q * 0.027, s: 0.03 - q * 0.0011, a: q * 1.3 + seed,
      c: ['#8f6bd1', '#a98ae0', '#7a52c4'][q % 3],
    })),
    [seed],
  )
  return (
    <group>
      {buds.map((b, i) => (
        <group key={i} rotation={[0, b.a, 0]}>
          {[-1, 1].map((sd) => (
            <mesh key={sd} geometry={BALL} position={[sd * b.s * 0.6, b.y, 0]} scale={[b.s * 0.8, b.s * 1.25, b.s * 0.8]}>
              <meshStandardMaterial color={b.c} roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Filler({ seed }) {
  return (
    <group>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} geometry={BALL} scale={0.03 + rnd(seed + i) * 0.012}
          position={[(rnd(seed + i * 3) - 0.5) * 0.1, rnd(seed + i * 5) * 0.08, (rnd(seed + i * 7) - 0.5) * 0.1]}>
          <meshStandardMaterial color={i % 2 ? '#f2e6ff' : '#c7a6f5'} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function Stem({ to }) {
  const { pos, quat, len } = useMemo(() => {
    const d = to.clone().sub(A)
    const len = d.length()
    return {
      len,
      quat: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()),
      pos: A.clone().add(to).multiplyScalar(0.5),
    }
  }, [to])
  return (
    <mesh position={pos} quaternion={quat} scale={[1, len, 1]}>
      <cylinderGeometry args={[0.011, 0.014, 1, 6]} />
      <meshStandardMaterial color="#3f8a5d" roughness={0.6} />
    </mesh>
  )
}

/* --------------------------- the bouquet --------------------------- */
const TYPES = ['rose', 'rose', 'filler', 'aster', 'rose', 'lav', 'rose', 'filler', 'rose', 'aster', 'lav', 'rose']

function Flowers() {
  const items = useMemo(() => {
    const N = 26
    return Array.from({ length: N }, (_, i) => {
      const u = (i + 0.5) / N
      const sinel = 1 - 0.82 * u
      const el = Math.asin(sinel)
      const phi = i * 2.39996
      const type = TYPES[i % TYPES.length]
      const R = type === 'filler' ? 0.98 : 0.85
      const p = new THREE.Vector3(
        D.x + R * Math.cos(el) * Math.cos(phi), D.y + R * sinel, D.z + R * Math.cos(el) * Math.sin(phi),
      )
      const dir = p.clone().sub(A).normalize()
      if (type === 'lav') p.addScaledVector(dir, 0.05)
      return {
        i, type, p, q: new THREE.Quaternion().setFromUnitVectors(UP, dir),
        color: ROSE_COLORS[i % ROSE_COLORS.length], size: 1.05 + rnd(i) * 0.2,
      }
    })
  }, [])

  return (
    <>
      {items.map((f) => (
        <group key={f.i}>
          <Stem to={f.p} />
          <group position={f.p} quaternion={f.q}>
            {f.type === 'rose' && <Rose color={f.color} size={f.size} />}
            {f.type === 'aster' && <Aster color={f.i % 2 ? '#e4ccff' : '#b992ee'} seed={f.i} />}
            {f.type === 'lav' && <Lavender seed={f.i} />}
            {f.type === 'filler' && <Filler seed={f.i * 11} />}
          </group>
        </group>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <group key={`leaf${i}`} position={[0, 0.1, 0]} rotation={[0, (i / 12) * Math.PI * 2 + 0.2, 0]}>
          <mesh geometry={BALL} position={[0.8, 0.06, 0]} rotation={[0, 0, 0.4]} scale={[0.26, 0.025, 0.1]}>
            <meshStandardMaterial color={i % 2 ? '#3f7d5a' : '#4f9a6c'} roughness={0.55} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function Wrapping() {
  return (
    <group>
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[0.95, 0.12, 1.5, 40, 1, true]} />
        <meshStandardMaterial color="#f1e4ff" roughness={0.55} side={THREE.FrontSide} />
      </mesh>
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[0.93, 0.11, 1.5, 40, 1, true]} />
        <meshStandardMaterial color="#6b3fa8" roughness={0.6} side={THREE.BackSide} />
      </mesh>
      {/* second purple paper layer on the front */}
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[0.99, 0.14, 1.38, 40, 1, true, -Math.PI * 0.62, Math.PI * 1.24]} />
        <meshStandardMaterial color="#b78cf0" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* ribbon */}
      <mesh position={[0, -0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.6, 0.03, 10, 48]} />
        <meshStandardMaterial color="#6d28d9" roughness={0.3} metalness={0.15} />
      </mesh>
      <group position={[0, -0.6, 0.64]}>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 0.12, 0.02, 0]} rotation={[0, sd * -0.4, sd * 0.5]} scale={[1, 0.65, 0.6]}>
            <torusGeometry args={[0.11, 0.03, 10, 26]} />
            <meshStandardMaterial color="#7c3aed" roughness={0.3} />
          </mesh>
        ))}
        {[-1, 1].map((sd) => (
          <mesh key={`t${sd}`} position={[sd * 0.07, -0.19, -0.01]} rotation={[0, 0, sd * 0.28]}>
            <boxGeometry args={[0.07, 0.3, 0.012]} />
            <meshStandardMaterial color="#6d28d9" roughness={0.3} />
          </mesh>
        ))}
        <mesh scale={0.045}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color="#5b21b6" roughness={0.3} />
        </mesh>
      </group>
    </group>
  )
}

const elastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1)

function PopIn({ children }) {
  const ref = useRef()
  const t0 = useRef(null)
  useFrame(({ clock }) => {
    if (t0.current == null) t0.current = clock.elapsedTime
    const t = Math.min(1, (clock.elapsedTime - t0.current) / 1.1)
    const e = elastic(t)
    if (ref.current) {
      ref.current.scale.setScalar(Math.max(0.001, e))
      ref.current.position.y = (1 - Math.min(1, t * 1.4)) * -1.2
      ref.current.rotation.y = (1 - t) * Math.PI * 1.2
    }
  })
  return <group ref={ref}>{children}</group>
}

function BouquetScene() {
  return (
    <Canvas camera={{ position: [0, 0.7, 5.9], fov: 35 }} dpr={[1, 1.75]} onCreated={({ camera }) => camera.lookAt(0, 0.1, 0)}>
      <ambientLight intensity={1.15} color="#f1e3ff" />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff1e6" />
      <pointLight position={[-4, 2, -3]} intensity={14} distance={10} color="#b889ff" />
      <Environment preset="city" />
      <PopIn>
        <Wrapping />
        <Flowers />
      </PopIn>
      <Sparkles count={40} position={[0, 0.4, 0]} scale={[4.5, 4, 4.5]} size={3} speed={0.5} color="#ffe6fb" />
      <OrbitControls enablePan={false} enableZoom={false} target={[0, 0.1, 0]} autoRotate autoRotateSpeed={2}
        minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.8} />
    </Canvas>
  )
}

export default function BouquetModal({ onContinue }) {
  return (
    <motion.div className="bq-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="bq-card"
        initial={{ y: 40, scale: 0.85, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 140 }}
      >
        <div className="bq-eyebrow">one more thing</div>
        <div className="bq-canvas">
          <BouquetScene />
        </div>
        <div className="bq-drag">↻ drag to turn it around</div>
        <motion.p className="bq-note" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.8 }}>
          P.S. You deserve flowers too, bebe. C:
        </motion.p>
        <motion.button className="primary-button bq-continue" onClick={onContinue}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
          Continue <span>💜</span>
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
