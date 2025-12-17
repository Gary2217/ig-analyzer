import { cn } from "../../lib/utils"

interface ProgressBarProps {
  value: number
  label: string
  showValue?: boolean
  className?: string
}

export function ProgressBar({ 
  value, 
  label, 
  showValue = true,
  className = ''
}: ProgressBarProps) {
  const getColorClass = (val: number) => {
    if (val >= 70) return 'bg-green-500'
    if (val >= 40) return 'bg-amber-500'
    return 'bg-gray-400'
  }

  const getTextColorClass = (val: number) => {
    if (val >= 70) return 'text-green-700 dark:text-green-400'
    if (val >= 40) return 'text-amber-700 dark:text-amber-400'
    return 'text-gray-700 dark:text-gray-400'
  }

  return (
    <div className={cn("w-full space-y-1", className)}>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        {showValue && (
          <span className={cn("font-medium tabular-nums", getTextColorClass(value))}>
            {Math.round(value)}%
          </span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-in-out",
            getColorClass(value)
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  )
}
