'use client'

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import { useEffect, useRef, useState } from 'react'

interface RadarChartProps {
  data: {
    subject: string
    value: number
    fullMark?: number
  }[]
  className?: string
}

export function RadarChartComponent({ 
  data, 
  className = ''
}: RadarChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [playAnimation, setPlayAnimation] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          if (!hasAnimated) {
            setPlayAnimation(true)
          }
        }
      },
      { threshold: 0.25 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [hasAnimated])

  useEffect(() => {
    if (!playAnimation) return

    setHasAnimated(true)
    const t = window.setTimeout(() => setPlayAnimation(false), 650)
    return () => window.clearTimeout(t)
  }, [playAnimation])

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <div className="w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            cx="50%"
            cy="50%"
            outerRadius="95%"
            data={data}
            margin={{ top: 12, right: 12, bottom: 10, left: 12 }}
          >
            <PolarGrid stroke="#374151" strokeOpacity={0.3} />
            <PolarAngleAxis
              dataKey="subject"
              tickLine={false}
              tick={{ fill: '#F8FAFC', fontSize: 14, fontWeight: 650, dy: 7 }}
            />
            <PolarRadiusAxis
              angle={90 - 360 / data.length}
              domain={[0, 100]}
              tickCount={3}
              tickFormatter={(v: any) => {
                const n = typeof v === "number" ? v : Number(v)
                if (n === 0 || n === 50 || n === 100) return String(n)
                return ""
              }}
              tick={{ fill: '#CBD5E1', fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />

            {inView ? (
              <Radar
                name="Score"
                dataKey="value"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.35}
                strokeWidth={2}
                isAnimationActive={playAnimation}
                animationDuration={600}
                animationEasing="ease-out"
                dot={{ fill: '#60A5FA', stroke: '#F8FAFC', strokeWidth: 2.5, r: 5.5 }}
              />
            ) : null}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
