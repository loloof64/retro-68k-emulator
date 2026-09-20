import { useEffect, useRef } from 'react'
import './Screen.css'
import type { SystemMemory } from '../memory'

interface ScreenProps {
  memory: SystemMemory
  frame: number // changes whenever the framebuffer may have been written
}

export default function Screen({ memory, frame }: ScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (frame > 0) {
      // Framebuffer bytes are already R,G,B,A in order, like ImageData.
      // Alpha forced opaque: the LCD has no transparency.
      const pixels = new Uint8ClampedArray(memory.getFramebuffer())
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
      ctx.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0)
      return
    }

    // Clear with black background (LCD off)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw placeholder grid
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 1

    const cellSize = 8
    for (let x = 0; x < canvas.width; x += cellSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }

    for (let y = 0; y < canvas.height; y += cellSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }

    // Draw welcome text
    ctx.fillStyle = '#00FF00'
    ctx.font = 'bold 12px monospace'
    ctx.fillText('68K Emulator Ready', 20, 30)
  }, [memory, frame])

  return (
    <div className="screen">
      <canvas
        ref={canvasRef}
        width={320}
        height={200}
        className="lcd-screen"
      />
      <div className="screen-info">
        <p>Résolution: 320×200</p>
        <p>Couleurs: RGBA 32 bits</p>
      </div>
    </div>
  )
}
