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
    className={cn("flex h-full w-full touch-none select-none items-center justify-center", className)}
    orientation={orientation}
    {...props}
  >
    <SliderPrimitive.Track className={cn("relative h-full w-full")}>
      <SliderPrimitive.Range className={cn("absolute w-full")} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-4 w-2.5 rounded-full border-[0.8px] border-neutral-200/60 bg-gradient-to-b from-neutral-400 to-neutral-200 shadow-[0px_2px_4px_rgba(0,0,0,1)] ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none",
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
