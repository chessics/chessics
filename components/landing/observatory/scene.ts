import * as THREE from 'three'
import { IDLE_SQUARES, LESSON_ANCHOR, plies, startingPieces } from './game'
import { beamTexture, boardTexture, pieceGrainTextures, radialTexture, squareGlowTexture, studioEnvironment, walnutTexture } from './textures'
import { createPieceFactory } from './pieces'

export interface ObservatoryElements {
  stage: HTMLElement
  canvas: HTMLCanvasElement
  caption: HTMLElement
}

export interface Observatory {
  dispose(): void
}

const ease = (t: number) => t * t * (3 - 2 * t)
const span = (t: number, a: number, b: number) => ease(Math.max(0, Math.min(1, (t - a) / (b - a))))
const SURFACE = 0.076
const PIECE_SCALE = 1.08
const square = (s: string) => new THREE.Vector3(s.charCodeAt(0) - 97 - 3.5, SURFACE, 8 - Number(s[1]) - 3.5)

const GAME = plies()
const OPEN = 900, PLY = 1050, MOVE = 620
const LAST_LAND = OPEN + (GAME.length - 1) * PLY + MOVE
const LESSON_START = LAST_LAND + 300, LESSON_END = LESSON_START + 1200
const HOLD_END = LESSON_END + 5200
const RESET_STAGGER = 500, RESET_MOVE = 1300, RESET_END = HOLD_END + RESET_STAGGER + RESET_MOVE
const CYCLE = RESET_END + 300
const FIRST_FRAME = LESSON_END

interface Hop { start: number; from: THREE.Vector3; to: THREE.Vector3; lift: number }
interface Track { object: THREE.Object3D; square: string; home: THREE.Vector3; end: THREE.Vector3; hops: Hop[]; capturedAt: number | null; order: number }

export function mountObservatory({ stage, canvas, caption }: ObservatoryElements): Observatory {
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const small = matchMedia('(max-width: 690px)')
  const pixelRatio = () => Math.min(devicePixelRatio, small.matches ? 1.5 : 2)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(pixelRatio())
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const environment = studioEnvironment(renderer)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.55
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

  const hemi = new THREE.HemisphereLight(0xf3e3c9, 0x24180e, 0.7)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffe6ba, 3.4)
  key.position.set(-5, 12, 6)
  key.castShadow = true
  key.shadow.mapSize.setScalar(small.matches ? 1024 : 2048)
  Object.assign(key.shadow.camera, { left: -6.5, right: 6.5, top: 6.5, bottom: -6.5, near: 4, far: 30 })
  key.shadow.normalBias = 0.025
  key.shadow.bias = -0.0003
  key.shadow.radius = 5
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xe9cf9f, 3.2)
  rim.position.set(4, 6, -9)
  scene.add(rim)
  const fill = new THREE.DirectionalLight(0xc9d4e3, 0.7)
  fill.position.set(8, 4, 4)
  scene.add(fill)

  const world = new THREE.Group()
  world.rotation.y = -0.18
  scene.add(world)

  const [grainMap, grainRoughness] = pieceGrainTextures(renderer)
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xeadcc0, map: grainMap, roughness: 0.4, roughnessMap: grainRoughness, clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.3, sheenColor: 0xfff2dc })
  const ebony = new THREE.MeshPhysicalMaterial({ color: 0x2e241c, map: grainMap, roughness: 0.4, roughnessMap: grainRoughness, clearcoat: 0.8, clearcoatRoughness: 0.16 })
  const brass = new THREE.MeshStandardMaterial({ color: 0x9c7840, roughness: 0.32, metalness: 0.9 })
  const walnut = new THREE.MeshStandardMaterial({ map: walnutTexture(renderer), roughness: 0.48 })
  const walnutDark = new THREE.MeshStandardMaterial({ color: 0x8a7a6c, map: walnut.map, roughness: 0.6 })
  const veneer = new THREE.MeshPhysicalMaterial({ map: boardTexture(small.matches ? 1024 : 2048, renderer), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.3 })

  function add(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = world, cast = true, receive = true) {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = cast
    m.receiveShadow = receive
    parent.add(m)
    return m
  }

  add(new THREE.BoxGeometry(9.05, 0.14, 9.05), walnutDark).position.y = -0.36
  add(new THREE.BoxGeometry(8.7, 0.3, 8.7), walnut).position.y = -0.14
  add(new THREE.BoxGeometry(8.2, 0.03, 8.2), brass).position.y = 0.02
  add(new THREE.BoxGeometry(8, 0.05, 8), walnut).position.y = 0.05
  const top = add(new THREE.PlaneGeometry(8, 8), veneer, world, false)
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.0755

  const ground = add(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.28 }), scene, false)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.65

  const piece = createPieceFactory({ ivory, ebony, brass, contact: radialTexture(0.05), segments: small.matches ? 40 : 64 })
  const occupant = new Map<string, Track>()
  const tracks: Track[] = startingPieces().map((p, order) => {
    const object = piece(p.type, p.color)
    world.add(object)
    const home = square(p.square)
    const track: Track = { object, square: p.square, home, end: home, hops: [], capturedAt: null, order }
    occupant.set(p.square, track)
    return track
  })
  GAME.forEach((ply, i) => {
    const start = OPEN + i * PLY
    if (ply.capture) {
      const victim = occupant.get(ply.capture)!
      victim.capturedAt = start + MOVE * 0.75
      occupant.delete(ply.capture)
    }
    const hop = (from: string, to: string, lift: number) => {
      const track = occupant.get(from)!
      occupant.delete(from)
      occupant.set(to, track)
      track.hops.push({ start, from: square(from), to: square(to), lift })
      track.end = square(to)
    }
    const knight = Math.abs(ply.from.charCodeAt(0) - ply.to.charCodeAt(0)) * Math.abs(Number(ply.from[1]) - Number(ply.to[1])) === 2
    hop(ply.from, ply.to, ply.rook ? 0.2 : knight ? 0.55 : 0.28)
    if (ply.rook) hop(ply.rook.from, ply.rook.to, 0.5)
  })

  function placeTrack(track: Track, t: number) {
    const { object } = track
    object.visible = true
    object.scale.setScalar(PIECE_SCALE)
    if (t >= HOLD_END) {
      const begin = HOLD_END + (track.order / 31) * RESET_STAGGER
      const r = span(t, begin, begin + RESET_MOVE)
      if (track.capturedAt !== null) {
        object.position.copy(track.home)
        object.scale.setScalar(PIECE_SCALE * r)
        object.visible = r > 0
      } else {
        object.position.lerpVectors(track.end, track.home, r)
        object.position.y += Math.sin(r * Math.PI) * (track.end.equals(track.home) ? 0 : 0.3)
      }
      return
    }
    object.position.copy(track.home)
    for (const hop of track.hops) {
      if (t < hop.start) break
      const p = span(t, hop.start, hop.start + MOVE)
      object.position.lerpVectors(hop.from, hop.to, p)
      object.position.y += Math.sin(p * Math.PI) * hop.lift
      if (p < 1) break
    }
    if (track.capturedAt !== null && t >= track.capturedAt) {
      const gone = span(t, track.capturedAt, track.capturedAt + 260)
      object.scale.setScalar(PIECE_SCALE * (1 - gone))
      object.position.y -= gone * 0.2
      object.visible = gone < 1
    }
  }

  const glowTex = squareGlowTexture()
  const glowGeo = new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2)
  const glows = IDLE_SQUARES.map(sq => {
    const m = add(glowGeo, new THREE.MeshBasicMaterial({ color: 0xf0a43a, alphaMap: glowTex, transparent: true, opacity: 0, depthWrite: false }), world, false, false)
    m.position.copy(square(sq)).setY(SURFACE + 0.002)
    return m.material
  })
  const kingPos = square('e8')
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xb0302a, alphaMap: radialTexture(0.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  add(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), haloMat, world, false, false).position.copy(kingPos).setY(SURFACE + 0.004)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x6e1a18, emissive: 0x8a1c18, emissiveIntensity: 0, roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0 })
  add(new THREE.TorusGeometry(0.47, 0.022, 10, 72).rotateX(Math.PI / 2), ringMat, world, false, false).position.copy(kingPos).setY(SURFACE + 0.02)

  const idleTracks = tracks.filter(t => IDLE_SQUARES.includes(t.square))
  const idleRingMat = new THREE.MeshStandardMaterial({ color: 0xc9a55c, emissive: 0xd8a64a, emissiveIntensity: 0, roughness: 0.3, metalness: 0.7, transparent: true, opacity: 0 })
  const idleRingGeo = new THREE.TorusGeometry(0.45, 0.024, 10, 72).rotateX(Math.PI / 2)
  for (const sq of IDLE_SQUARES) add(idleRingGeo, idleRingMat, world, false, false).position.copy(square(sq)).setY(SURFACE + 0.022)
  const spotTarget = new THREE.Object3D()
  spotTarget.position.copy(square(LESSON_ANCHOR))
  world.add(spotTarget)
  const spot = new THREE.SpotLight(0xffe2b0, 0, 14, 0.3, 0.7, 1.1)
  spot.position.copy(square(LESSON_ANCHOR)).add(new THREE.Vector3(-1.2, 7, 2.4))
  spot.target = spotTarget
  world.add(spot)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xe0a94e, alphaMap: beamTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const beamGeo = new THREE.CylinderGeometry(0.46, 0.46, 2.2, 48, 1, true).translate(0, 1.1, 0)
  for (const sq of IDLE_SQUARES) add(beamGeo, beamMat, world, false, false).position.copy(square(sq))
  const LIFT = 0.3, DIM = 0.45, SPOT_INTENSITY = 90

  function lessonStrength(t: number) {
    if (t >= HOLD_END) return 1 - span(t, HOLD_END, HOLD_END + 450)
    return span(t, LESSON_START, LESSON_END)
  }

  let elapsed = FIRST_FRAME, last = 0, raf = 0, visible = true

  function anchorCaption() {
    const p = square(LESSON_ANCHOR)
    p.y = 2.35
    world.localToWorld(p)
    p.project(camera)
    const w = stage.clientWidth, h = stage.clientHeight, half = caption.offsetWidth / 2 + 8
    caption.style.left = Math.max(half, Math.min(w - half, ((p.x + 1) * w) / 2)) + 'px'
    caption.style.top = ((1 - p.y) * h) / 2 + 'px'
  }

  function draw(t: number) {
    for (const track of tracks) placeTrack(track, t)
    const k = lessonStrength(t)
    const breath = t > LESSON_END && t < HOLD_END ? 0.85 + 0.15 * Math.cos(((t - LESSON_END) / 2400) * Math.PI * 2) : 1
    for (const track of idleTracks) track.object.position.y += ease(k) * LIFT
    idleRingMat.opacity = k
    beamMat.opacity = k * 0.36 * breath
    key.intensity = 3.4 * (1 - DIM * k)
    hemi.intensity = 0.7 * (1 - DIM * k)
    rim.intensity = 3.2 * (1 - 0.2 * k)
    scene.environmentIntensity = 0.55 * (1 - 0.3 * k)
    spot.intensity = SPOT_INTENSITY * k
    glows.forEach((g, i) => { g.opacity = span(t, LESSON_START + i * 160, LESSON_START + i * 160 + 600) * (t >= HOLD_END ? k : 1) * 0.95 * breath })
    haloMat.opacity = k * breath
    ringMat.opacity = k
    ringMat.emissiveIntensity = k * 1.6 * breath
    idleRingMat.emissiveIntensity = k * 1.4 * breath
    caption.style.opacity = String(k)
    renderer.render(scene, camera)
    world.updateMatrixWorld()
    anchorCaption()

    let ply = -1
    if (t < HOLD_END) for (let i = 0; i < GAME.length && t >= OPEN + i * PLY + MOVE * 0.5; i++) ply = i
    stage.dataset.ply = String(ply)
    stage.dataset.phase = t < OPEN ? 'start' : t < LAST_LAND ? 'play' : t < HOLD_END ? 'hold' : t < RESET_END ? 'reset' : 'start'
  }

  function frame(now: number) {
    raf = 0
    if (motion.matches) { syncMotion(); return }
    if (!visible || document.hidden) { last = 0; return }
    if (last) elapsed = (elapsed + Math.min(now - last, 80)) % CYCLE
    last = now
    draw(elapsed)
    raf = requestAnimationFrame(frame)
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0 }
  function start() { if (!raf && visible && !document.hidden && !motion.matches) raf = requestAnimationFrame(frame) }
  function syncMotion() { stop(); if (motion.matches) elapsed = FIRST_FRAME; draw(elapsed); start() }

  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) start(); else stop() }, { threshold: 0.05 })
  intersection.observe(stage)
  const onVisibility = () => { if (document.hidden) stop(); else start() }
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', syncMotion)

  const HOME_ROTATION = -0.18, RADIANS_PER_PX = 0.006, RETURN_DELAY = 2500
  let dragging = false, lastX = 0, lastMoveAt = 0, velocity = 0, releasedAt = 0, spinRaf = 0, spinLast = 0

  const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

  function spinFrame(now: number) {
    spinRaf = 0
    const dt = spinLast ? Math.min(now - spinLast, 64) : 16
    spinLast = now
    let changed = false
    if (!dragging && Math.abs(velocity) > 0.00002) {
      world.rotation.y += velocity * dt
      velocity *= Math.exp(-dt / 320)
      releasedAt = now
      changed = true
    } else if (!dragging && now - releasedAt > RETURN_DELAY) {
      const delta = angleTo(world.rotation.y, HOME_ROTATION)
      world.rotation.y = Math.abs(delta) < 0.0008 ? HOME_ROTATION : world.rotation.y + delta * (1 - Math.exp(-dt / 420))
      changed = true
    }
    const goal = spinning() ? spinDistance : homeDistance
    if (distance !== goal) {
      distance = Math.abs(goal - distance) < 0.005 ? goal : distance + (goal - distance) * (1 - Math.exp(-dt / 260))
      place(distance)
      changed = true
    }
    if (changed && !raf) draw(elapsed)
    if (dragging || Math.abs(velocity) > 0.00002 || world.rotation.y !== HOME_ROTATION || distance !== goal) spinRaf = requestAnimationFrame(spinFrame)
    else spinLast = 0
  }
  function wakeSpin() { if (!spinRaf && !motion.matches) spinRaf = requestAnimationFrame(spinFrame) }

  const onDown = (e: PointerEvent) => {
    dragging = true
    velocity = 0
    lastX = e.clientX
    lastMoveAt = e.timeStamp
    canvas.setPointerCapture(e.pointerId)
    if (motion.matches) { distance = spinDistance; place(distance); draw(elapsed) }
    else wakeSpin()
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const step = (e.clientX - lastX) * RADIANS_PER_PX
    const dt = Math.max(1, e.timeStamp - lastMoveAt)
    world.rotation.y += step
    velocity = velocity * 0.6 + (step / dt) * 0.4
    lastX = e.clientX
    lastMoveAt = e.timeStamp
    draw(elapsed)
  }
  const onUp = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    if (e.timeStamp - lastMoveAt > 80) velocity = 0
    releasedAt = performance.now()
    wakeSpin()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  const viewDir = new THREE.Vector3(0.43, 0.52, 0.68).normalize(), target = new THREE.Vector3(0, 0.3, 0)
  const spinPoints: THREE.Vector3[] = []
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    for (const y of [-0.5, 1.5]) spinPoints.push(new THREE.Vector3(Math.cos(a) * 6.4, y, Math.sin(a) * 6.4))
  }
  const homePoints: THREE.Vector3[] = []
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    homePoints.push(new THREE.Vector3(x * 4.53, -0.43, z * 4.53), new THREE.Vector3(x * 4.53, 0.08, z * 4.53), new THREE.Vector3(x * 3.5, 1.75, z * 3.5))
  }
  homePoints.forEach(p => p.applyAxisAngle(THREE.Object3D.DEFAULT_UP, HOME_ROTATION))
  const probe = new THREE.Vector3()
  function place(distance: number) {
    camera.position.copy(viewDir).multiplyScalar(distance).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  function fitDistance(points: THREE.Vector3[], top: number) {
    let lo = 8, hi = 60
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      place(mid)
      if (points.every(p => { probe.copy(p).project(camera); return Math.abs(probe.x) <= 0.98 && probe.y <= top && probe.y >= -0.9 })) hi = mid
      else lo = mid
    }
    return hi
  }
  let homeDistance = 30, spinDistance = 30, distance = 30
  const spinning = () => dragging || Math.abs(angleTo(world.rotation.y, HOME_ROTATION)) > 0.01
  function resize() {
    const box = stage.getBoundingClientRect()
    if (!box.width || !box.height) return
    renderer.setPixelRatio(pixelRatio())
    renderer.setSize(box.width, box.height, false)
    camera.aspect = box.width / box.height
    camera.updateProjectionMatrix()
    homeDistance = fitDistance(homePoints, 0.7)
    spinDistance = Math.max(homeDistance, fitDistance(spinPoints, 0.86))
    distance = spinning() ? spinDistance : homeDistance
    place(distance)
    draw(elapsed)
  }
  const resizer = new ResizeObserver(resize)
  resizer.observe(stage)
  resize()
  syncMotion()
  stage.dataset.ready = 'true'

  return {
    dispose() {
      stop()
      cancelAnimationFrame(spinRaf)
      intersection.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motion.removeEventListener('change', syncMotion)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      const disposed = new Set<{ dispose(): void }>()
      scene.traverse(object => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) disposed.add(mesh.geometry)
        const materials = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : []
        for (const material of materials) {
          disposed.add(material)
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) disposed.add(value)
        }
      })
      disposed.forEach(d => d.dispose())
      environment.dispose()
      renderer.dispose()
      delete stage.dataset.ready
    },
  }
}
