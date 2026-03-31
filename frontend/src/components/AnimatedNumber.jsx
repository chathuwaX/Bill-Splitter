import { useEffect, useRef, useState } from 'react'

export default function AnimatedNumber({ value, decimals = 2 }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)

  useEffect(() => {
    const start = display
    const end = value
    const duration = 600
    const startTime = performance.now()

    const animate = now => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + (end - start) * eased)
      if (progress < 1) ref.current = requestAnimationFrame(animate)
    }

    ref.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(ref.current)
  }, [value])

  return <>{display.toFixed(decimals)}</>
}
