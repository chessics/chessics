import * as THREE from 'three'
import type { PieceType } from './game'

type Point = [number, number]
type Run = Point[]

function profile(runs: Run[], density: (run: number) => number = () => 8) {
  const points: THREE.Vector2[] = []
  runs.forEach((run, index) => {
    const v = run.map(([x, y]) => new THREE.Vector2(x, y))
    const sampled = v.length > 2 ? new THREE.SplineCurve(v).getPoints((v.length - 1) * density(index)) : v
    for (const p of sampled) {
      const last = points[points.length - 1]
      if (!last || last.distanceTo(p) > 1e-5) points.push(p)
    }
  })
  return points
}

function foot(R: number): Run[] {
  return [
    [[0, 0], [R, 0]],
    [[R, 0], [R * 1.025, 0.035], [R * 0.97, 0.07]],
    [[R * 0.97, 0.07], [R * 0.86, 0.085]],
    [[R * 0.86, 0.085], [R * 0.85, 0.12], [R * 0.74, 0.15]],
  ]
}

const RADIUS: Record<PieceType, number> = { p: 0.29, r: 0.34, n: 0.34, b: 0.32, q: 0.36, k: 0.37 }

const PROFILES: Record<PieceType, Run[]> = {
  p: [
    ...foot(RADIUS.p),
    [[0.215, 0.15], [0.17, 0.2], [0.12, 0.34], [0.1, 0.42]],
    [[0.1, 0.42], [0.17, 0.44], [0.175, 0.47], [0.1, 0.49]],
    [[0.1, 0.49], [0.14, 0.52], [0.165, 0.6], [0.14, 0.69], [0.07, 0.75], [0, 0.765]],
  ],
  r: [
    ...foot(RADIUS.r),
    [[0.252, 0.15], [0.22, 0.22], [0.2, 0.45], [0.215, 0.62]],
    [[0.215, 0.62], [0.27, 0.66], [0.29, 0.72]],
    [[0.29, 0.72], [0.29, 0.8]],
    [[0.29, 0.8], [0.2, 0.8]],
    [[0.2, 0.8], [0.2, 0.76]],
    [[0.2, 0.76], [0, 0.76]],
  ],
  n: [
    ...foot(RADIUS.n),
    [[0.252, 0.15], [0.245, 0.215]],
    [[0.245, 0.215], [0, 0.215]],
  ],
  b: [
    ...foot(RADIUS.b),
    [[0.237, 0.15], [0.18, 0.22], [0.12, 0.45], [0.1, 0.56]],
    [[0.1, 0.56], [0.19, 0.59], [0.195, 0.62], [0.1, 0.65]],
    [[0.1, 0.65], [0.13, 0.67], [0.09, 0.69]],
    [[0.09, 0.69], [0.15, 0.77], [0.172, 0.86], [0.14, 0.96], [0.07, 1.04], [0.03, 1.07]],
    [[0.03, 1.07], [0, 1.075]],
  ],
  q: [
    ...foot(RADIUS.q),
    [[0.266, 0.15], [0.21, 0.22], [0.16, 0.55], [0.15, 0.72]],
    [[0.15, 0.72], [0.25, 0.76], [0.255, 0.8], [0.15, 0.83]],
    [[0.15, 0.83], [0.19, 0.95], [0.24, 1.05]],
    [[0.24, 1.05], [0.17, 1.08], [0.08, 1.1], [0, 1.11]],
  ],
  k: [
    ...foot(RADIUS.k),
    [[0.274, 0.15], [0.22, 0.22], [0.17, 0.55], [0.16, 0.74]],
    [[0.16, 0.74], [0.26, 0.78], [0.265, 0.82], [0.16, 0.85]],
    [[0.16, 0.85], [0.19, 0.875], [0.15, 0.9]],
    [[0.15, 0.9], [0.19, 1.0], [0.235, 1.09]],
    [[0.235, 1.09], [0.2, 1.12], [0.1, 1.14], [0, 1.15]],
  ],
}

function beveledBox(w: number, h: number, d: number, bevel = 0.018) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + bevel, -h / 2 + bevel)
  s.lineTo(w / 2 - bevel, -h / 2 + bevel)
  s.lineTo(w / 2 - bevel, h / 2 - bevel)
  s.lineTo(-w / 2 + bevel, h / 2 - bevel)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 })
  g.translate(0, 0, -(d - bevel * 2) / 2)
  return g
}

function battlements() {
  const parts: THREE.BufferGeometry[] = []
  const inner = 0.2, outer = 0.29, count = 5, span = (Math.PI * 2) / count, solid = span * 0.64
  for (let i = 0; i < count; i++) {
    const a0 = i * span, a1 = a0 + solid
    const s = new THREE.Shape()
    s.absarc(0, 0, outer - 0.012, a0, a1, false)
    s.absarc(0, 0, inner + 0.012, a1, a0, true)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 })
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0.8, 0)
    parts.push(g)
  }
  return parts
}

function coronet() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    parts.push(new THREE.SphereGeometry(0.04, 12, 10).translate(Math.cos(a) * 0.22, 1.07, Math.sin(a) * 0.22))
  }
  parts.push(new THREE.SphereGeometry(0.06, 16, 12).translate(0, 1.15, 0))
  return parts
}

function knightShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.21, 0.2)
  s.bezierCurveTo(-0.25, 0.32, -0.275, 0.45, -0.255, 0.56)
  s.bezierCurveTo(-0.235, 0.7, -0.19, 0.83, -0.12, 0.92)
  s.lineTo(-0.1, 1.08)
  s.bezierCurveTo(-0.075, 1.03, -0.055, 0.99, -0.04, 0.975)
  s.lineTo(-0.005, 1.06)
  s.bezierCurveTo(0.015, 1.0, 0.03, 0.965, 0.05, 0.945)
  s.bezierCurveTo(0.14, 0.9, 0.24, 0.8, 0.3, 0.7)
  s.bezierCurveTo(0.345, 0.65, 0.36, 0.61, 0.335, 0.58)
  s.lineTo(0.268, 0.566)
  s.lineTo(0.3, 0.535)
  s.bezierCurveTo(0.29, 0.5, 0.26, 0.48, 0.22, 0.48)
  s.bezierCurveTo(0.16, 0.48, 0.09, 0.51, 0.045, 0.575)
  s.bezierCurveTo(0.06, 0.45, 0.19, 0.33, 0.215, 0.2)
  return s
}

function knightHead() {
  const depth = 0.15
  const g = new THREE.ExtrudeGeometry(knightShape(), { depth, bevelEnabled: true, bevelThickness: 0.065, bevelSize: 0.03, bevelSegments: 7, curveSegments: 32 })
  g.translate(0, 0, -depth / 2)
  const pos = g.attributes.position, nrm = g.attributes.normal
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const n = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    const f = (1 - 0.38 * smooth(0.04, 0.32, x) * smooth(0.42, 0.72, y)) * (1 + 0.25 * (1 - smooth(0.18, 0.46, y)))
    pos.setZ(i, pos.getZ(i) * f)
    n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i) / f).normalize()
    nrm.setXYZ(i, n.x, n.y, n.z)
  }
  return g
}

function knightMane() {
  const s = new THREE.Shape()
  s.moveTo(-0.205, 0.26)
  s.bezierCurveTo(-0.255, 0.4, -0.265, 0.52, -0.25, 0.6)
  s.bezierCurveTo(-0.23, 0.72, -0.18, 0.84, -0.11, 0.93)
  s.lineTo(-0.07, 0.9)
  s.bezierCurveTo(-0.14, 0.8, -0.18, 0.7, -0.195, 0.6)
  s.bezierCurveTo(-0.21, 0.5, -0.2, 0.38, -0.16, 0.27)
  s.closePath()
  const depth = 0.05
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 4, curveSegments: 24 })
  g.translate(-0.012, 0, -depth / 2)
  return g
}

function carveMitre(g: THREE.BufferGeometry) {
  const pos = g.attributes.position
  const side = new THREE.Vector3(0.6, 0, 0.8), tilt = new THREE.Vector3(0.8, 0, -0.6)
  const normal = new THREE.Vector3(0, 1, 0).addScaledVector(tilt, 0.8).normalize(), origin = new THREE.Vector3(0, 0.93, 0)
  const width = 0.02
  const v = new THREE.Vector3(), radial = new THREE.Vector3()
  const carved: number[] = []
  const colors = new Float32Array(pos.count * 3).fill(1)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const facing = v.x * side.x + v.z * side.z
    if (v.y < 0.76 || facing < -0.02) continue
    const d = v.clone().sub(origin).dot(normal)
    if (Math.abs(d) > width * 1.6) continue
    carved.push(i)
    if (Math.abs(d) > width) continue
    const fade = Math.min(1, (facing + 0.02) / 0.08)
    const depth = (1 - (d / width) ** 2) * fade
    const press = 0.06 * depth
    colors.fill(1 - 0.75 * depth, i * 3, i * 3 + 3)
    radial.set(v.x, 0, v.z)
    const r = radial.length()
    if (r < 1e-4) continue
    radial.multiplyScalar(Math.max(0.02, r - press) / r)
    pos.setXYZ(i, radial.x, v.y, radial.z)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const original = (g.attributes.normal.array as Float32Array).slice()
  g.computeVertexNormals()
  const keep = new Set(carved), normals = g.attributes.normal
  for (let i = 0; i < normals.count; i++) if (!keep.has(i)) normals.setXYZ(i, original[i * 3], original[i * 3 + 1], original[i * 3 + 2])
  return g
}

interface PieceMaterials { ivory: THREE.Material; ebony: THREE.Material; brass: THREE.Material; contact: THREE.Texture; segments: number }

export function createPieceFactory({ ivory, ebony, brass, contact, segments }: PieceMaterials) {
  const cache = new Map<PieceType, THREE.BufferGeometry[]>()
  const rings = new Map<PieceType, THREE.BufferGeometry>()
  function parts(type: PieceType) {
    const cached = cache.get(type)
    if (cached) return cached
    const lathe = type === 'b' ? new THREE.LatheGeometry(profile(PROFILES.b, run => (run >= PROFILES.b.length - 2 ? 28 : 8)), segments * 2) : new THREE.LatheGeometry(profile(PROFILES[type]), segments)
    const list: THREE.BufferGeometry[] = [type === 'b' ? carveMitre(lathe) : lathe]
    if (type === 'r') list.push(...battlements())
    if (type === 'n') list.push(knightHead(), knightMane())
    if (type === 'b') list.push(new THREE.SphereGeometry(0.05, 20, 14).translate(0, 1.115, 0))
    if (type === 'q') list.push(...coronet())
    if (type === 'k') {
      list.push(beveledBox(0.075, 0.27, 0.075).translate(0, 1.27, 0))
      list.push(beveledBox(0.22, 0.072, 0.075).translate(0, 1.3, 0))
    }
    cache.set(type, list)
    return list
  }
  const carvedMaterials = new Map<'w' | 'b', THREE.Material>()
  function carved(color: 'w' | 'b') {
    let m = carvedMaterials.get(color)
    if (!m) {
      m = (color === 'w' ? ivory : ebony).clone()
      m.vertexColors = true
      carvedMaterials.set(color, m)
    }
    return m
  }
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contact, transparent: true, opacity: 0.6, depthWrite: false })

  return function piece(type: PieceType, color: 'w' | 'b') {
    const group = new THREE.Group()
    const material = color === 'w' ? ivory : ebony
    for (const geo of parts(type)) {
      const m = new THREE.Mesh(geo, geo.attributes.color ? carved(color) : material)
      m.castShadow = m.receiveShadow = true
      group.add(m)
    }
    let ring = rings.get(type)
    if (!ring) {
      ring = new THREE.TorusGeometry(RADIUS[type] * 0.875, 0.011, 8, segments).rotateX(Math.PI / 2).translate(0, 0.086, 0)
      rings.set(type, ring)
    }
    group.add(new THREE.Mesh(ring, brass))
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat)
    contactShadow.scale.setScalar(RADIUS[type] * 3)
    contactShadow.position.y = 0.003
    contactShadow.renderOrder = -1
    group.add(contactShadow)
    if (type === 'n') group.rotation.y = color === 'w' ? 0.74 : Math.PI + 0.74
    group.scale.setScalar(1.08)
    return group
  }
}
