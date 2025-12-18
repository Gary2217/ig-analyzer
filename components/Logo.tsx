import React from "react"

type LogoProps = {
  size?: number
  className?: string
}

export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2" />
      <line x1="14" y1="5" x2="14" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="19" x2="14" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="14" x2="9" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2" fill="currentColor" />
    </svg>
  )
}
