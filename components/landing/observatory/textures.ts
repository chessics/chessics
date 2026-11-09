import * as THREE from 'three'

function rng(seed = 7) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex)
  c.offsetHSL(0, 0, amount / 255)
  return '#' + c.getHexString()
}

function canvas2d(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { canvas, ctx }
}

function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, horizontal: boolean, rand: () => number, strength: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  const length = horizontal ? w : h
  const across = horizontal ? h : w
  const lines = Math.round(across / 2.4)
  const phase = rand() * 10
  const freq = (0.8 + rand() * 1.4) / length
  const amp = across * (0.008 + rand() * 0.018)
  for (let i = 0; i < lines; i++) {
    const offset = ((i + rand() * 0.8) / lines) * across
    const alpha = (0.025 + rand() * 0.08) * strength
    ctx.strokeStyle = rand() < 0.55 ? `rgba(38,20,8,${alpha})` : `rgba(255,236,204,${alpha * 0.55})`
    ctx.lineWidth = 0.6 + rand() * 1.8
    ctx.beginPath()
    for (let s = 0; s <= length; s += length / 24) {
      const wobble = Math.sin(s * freq * Math.PI * 2 + phase + i * 0.045) * amp
      const px = horizontal ? x + s : x + offset + wobble
      const py = horizontal ? y + offset + wobble : y + s
      if (s === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function colorTexture(canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return texture
}

export function boardTexture(size: number, renderer: THREE.WebGLRenderer) {
  const { canvas, ctx } = canvas2d(size)
  const rand = rng(11)
  const sq = size / 8
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 0
      const v = (rand() - 0.5) * 9
      ctx.fillStyle = light ? shade('#9f8662', v) : shade('#4f3c2b', v * 0.6)
      ctx.fillRect(f * sq, r * sq, sq, sq)
      grain(ctx, f * sq, r * sq, sq, sq, light, rand, light ? 0.9 : 0.8)
    }
  }
  ctx.strokeStyle = 'rgba(18,10,4,.38)'
  ctx.lineWidth = Math.max(1, size / 1024)
  for (let i = 1; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(i * sq, 0)
    ctx.lineTo(i * sq, size)
    ctx.moveTo(0, i * sq)
    ctx.lineTo(size, i * sq)
    ctx.stroke()
  }
  return colorTexture(canvas, renderer)
}

export function walnutTexture(renderer: THREE.WebGLRenderer) {
  const { canvas, ctx } = canvas2d(512)
  ctx.fillStyle = '#33241a'
  ctx.fillRect(0, 0, 512, 512)
  grain(ctx, 0, 0, 512, 512, true, rng(3), 1.6)
  return colorTexture(canvas, renderer)
}

export function pieceGrainTextures(renderer: THREE.WebGLRenderer) {
  const { canvas, ctx } = canvas2d(512)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, 512, 512)
  grain(ctx, 0, 0, 512, 512, false, rng(23), 2.2)
  const color = colorTexture(canvas, renderer)
  const roughness = new THREE.CanvasTexture(canvas)
  for (const t of [color, roughness]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(3, 1)
  }
  return [color, roughness] as const
}

export function radialTexture(inner = 0.15) {
  const { canvas, ctx } = canvas2d(128)
  const g = ctx.createRadialGradient(64, 64, 64 * inner, 64, 64, 64)
  g.addColorStop(0, '#fff')
  g.addColorStop(1, '#000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

export function beamTexture() {
  const { canvas, ctx } = canvas2d(16)
  canvas.height = 128
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(0, '#000')
  g.addColorStop(0.55, '#3a3a3a')
  g.addColorStop(1, '#fff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 16, 128)
  return new THREE.CanvasTexture(canvas)
}

export function squareGlowTexture() {
  const { canvas, ctx } = canvas2d(128)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#5a5a5a'
  ctx.fillRect(9, 9, 110, 110)
  ctx.shadowColor = '#fff'
  ctx.shadowBlur = 7
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 5
  ctx.strokeRect(11, 11, 106, 106)
  return new THREE.CanvasTexture(canvas)
}

export function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new THREE.Scene()
  room.background = new THREE.Color(0x0c0a08)
  const box = new THREE.BoxGeometry(1, 1, 1)
  const materials: THREE.Material[] = []
  const panel = (color: number, intensity: number, position: [number, number, number], scale: [number, number, number]) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
    materials.push(material)
    const m = new THREE.Mesh(box, material)
    m.position.set(...position)
    m.scale.set(...scale)
    room.add(m)
  }
  panel(0xffe2b0, 7, [-4, 9, 4], [7, 0.1, 4])
  panel(0xe8c890, 2.6, [6, 3, -6], [0.1, 4, 9])
  panel(0xb8c6dc, 1.3, [7, 2, 5], [0.1, 3, 5])
  panel(0x3a2a1c, 1, [0, -3, 0], [30, 0.1, 30])
  const target = pmrem.fromScene(room, 0.04)
  pmrem.dispose()
  box.dispose()
  materials.forEach(m => m.dispose())
  return target
}
