import React, { useEffect, useRef } from 'react'
import './Screen.css'

export default function Screen() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

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
  }, [])

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
        <p>Mode: Monocolor</p>
      </div>
    </div>
  )
}
