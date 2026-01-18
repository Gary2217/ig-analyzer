"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

type AccordionType = "single" | "multiple"

type AccordionValue = string | string[]

type AccordionContextValue = {
  type: AccordionType
  value: AccordionValue
  collapsible: boolean
  setValue: (next: AccordionValue) => void
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null)

type AccordionProps = React.HTMLAttributes<HTMLDivElement> & {
  type?: AccordionType
  value?: AccordionValue
  defaultValue?: AccordionValue
  onValueChange?: (value: AccordionValue) => void
  collapsible?: boolean
}

function normalizeValue(type: AccordionType, value: AccordionValue | undefined): AccordionValue {
  if (type === "multiple") return Array.isArray(value) ? value : []
  return typeof value === "string" ? value : ""
}

function Accordion({
  className,
  type = "single",
  value,
  defaultValue,
  onValueChange,
  collapsible = true,
  ...props
}: AccordionProps) {
  const isControlled = value !== undefined

  const [uncontrolledValue, setUncontrolledValue] = React.useState<AccordionValue>(() =>
    normalizeValue(type, defaultValue)
  )

  const currentValue = normalizeValue(type, isControlled ? value : uncontrolledValue)

  const setValue = React.useCallback(
    (next: AccordionValue) => {
      if (!isControlled) setUncontrolledValue(next)
      onValueChange?.(next)
    },
    [isControlled, onValueChange]
  )

  const ctx = React.useMemo<AccordionContextValue>(
    () => ({ type, value: currentValue, collapsible, setValue }),
    [collapsible, currentValue, setValue, type]
  )

  return (
    <AccordionContext.Provider value={ctx}>
      <div data-slot="accordion" className={cn("min-w-0", className)} {...props} />
    </AccordionContext.Provider>
  )
}

type AccordionItemContextValue = {
  value: string
}

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null)

type AccordionItemProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string
}

function AccordionItem({ className, value, ...props }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div data-slot="accordion-item" className={cn("min-w-0", className)} {...props} />
    </AccordionItemContext.Provider>
  )
}

function useAccordion() {
  const ctx = React.useContext(AccordionContext)
  if (!ctx) throw new Error("Accordion components must be used within <Accordion />")
  return ctx
}

function useAccordionItem() {
  const ctx = React.useContext(AccordionItemContext)
  if (!ctx) throw new Error("Accordion components must be used within <AccordionItem />")
  return ctx
}

function isItemOpen(type: AccordionType, value: AccordionValue, itemValue: string) {
  return type === "multiple" ? (value as string[]).includes(itemValue) : value === itemValue
}

function toggleItem(type: AccordionType, value: AccordionValue, itemValue: string, collapsible: boolean): AccordionValue {
  if (type === "multiple") {
    const arr = Array.isArray(value) ? value : []
    return arr.includes(itemValue) ? arr.filter((x) => x !== itemValue) : [...arr, itemValue]
  }

  const current = typeof value === "string" ? value : ""
  if (current === itemValue) return collapsible ? "" : current
  return itemValue
}

type AccordionTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>

function AccordionTrigger({ className, onClick, ...props }: AccordionTriggerProps) {
  const { type, value, collapsible, setValue } = useAccordion()
  const item = useAccordionItem()
  const open = isItemOpen(type, value, item.value)

  return (
    <button
      type="button"
      data-slot="accordion-trigger"
      data-state={open ? "open" : "closed"}
      aria-expanded={open}
      className={cn("w-full min-w-0", className)}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        setValue(toggleItem(type, value, item.value, collapsible))
      }}
      {...props}
    />
  )
}

type AccordionContentProps = React.HTMLAttributes<HTMLDivElement> & {
  forceMount?: boolean
}

function AccordionContent({ className, forceMount, ...props }: AccordionContentProps) {
  const { type, value } = useAccordion()
  const item = useAccordionItem()
  const open = isItemOpen(type, value, item.value)

  if (!forceMount && !open) return null

  return (
    <div
      data-slot="accordion-content"
      data-state={open ? "open" : "closed"}
      className={cn(open ? "" : "hidden", className)}
      {...props}
    />
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
