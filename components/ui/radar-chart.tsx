'use client'

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'

interface RadarChartProps {
  data: {
    subject: string
    value: number
    fullMark?: number
  }[]
  width?: number | string
  height?: number
  className?: string
}

export function RadarChartComponent({ 
  data, 
  width = '100%', 
  height = 300,
  className = ''
}: RadarChartProps) {
  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width={width} height="100%">
        <RadarChart 
          cx="50%" 
          cy="50%" 
          outerRadius="80%" 
          data={data}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <PolarGrid stroke="#374151" strokeOpacity={0.3} />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#9CA3AF', fontSize: 12 }} 
            tickLine={false}
          />
          <PolarRadiusAxis 
            angle={90 - 360 / data.length} 
            domain={[0, 100]}
            tickCount={6}
            tick={{ fill: '#6B7280', fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#3B82F6"
            fill="#3B82F6"
            fillOpacity={0.4}
            strokeWidth={2}
            dot={{ fill: '#2563EB', stroke: '#fff', strokeWidth: 2, r: 4 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
