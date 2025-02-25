"use client"

import { cn } from "@/lib/utils"
import * as SliderPrimitive from "@radix-ui/react-slider"
import * as React from "react"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, orientation, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex touch-none select-none",
      orientation === "vertical" ? "items-center justify-center h-full" : "items-center w-full",
      className,
    )}
    orientation={orientation}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative overflow-hidden bg-black",
        orientation === "vertical" ? "h-full w-4 rounded-full" : "w-full h-4 rounded-full",
      )}
    >
      <SliderPrimitive.Range className={cn("absolute ", orientation === "vertical" ? "w-full" : "h-full")} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block bg-neutral-200 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-md border",
        orientation === "vertical" ? "h-3 w-3 rounded-full" : "w-3 h-full rounded-full",
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
