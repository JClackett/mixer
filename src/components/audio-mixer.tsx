"use client"
import "ios-vibrator-pro-max"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { AudioLinesIcon, BirdIcon, DropletsIcon, VolumeOffIcon, WavesIcon } from "lucide-react"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

// Define types for better type safety
type TrackType = {
  url: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  gainBoost: number
}

type EQBand = "HIGH" | "MID" | "LOW"
type EQSettings = Record<EQBand, number>

type AudioNodes = {
  source: MediaElementAudioSourceNode | null
  high: BiquadFilterNode | null
  mid: BiquadFilterNode | null
  low: BiquadFilterNode | null
  gain: GainNode | null
  buffer?: AudioBuffer | null
  bufferSource?: AudioBufferSourceNode | null
}

// Utility function to detect iOS devices
const isIOS = () => {
  return (
    ["iPad Simulator", "iPhone Simulator", "iPod Simulator", "iPad", "iPhone", "iPod"].includes(navigator.platform) ||
    // iPad on iOS 13 detection
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  )
}

// Move constants outside component to prevent recreation on each render
const TRACKS: TrackType[] = [
  {
    url: "/birds.wav",
    label: "BIRDS",
    icon: BirdIcon,
    gainBoost: 0.3,
  },
  {
    url: "/waves.wav",
    label: "WAVES",
    icon: WavesIcon,
    gainBoost: 0.4,
  },
  {
    url: "/rain.wav",
    label: "RAIN",
    icon: DropletsIcon,
    gainBoost: 3,
  },
  {
    url: "/noise.wav",
    label: "NOISE",
    icon: AudioLinesIcon,
    gainBoost: 1.0,
  },
]

const EQ_BANDS: EQBand[] = ["HIGH", "MID", "LOW"]
const DEFAULT_VOLUME = 50
const INITIAL_MASTER_VOLUME = 75

// Define frequency values as constants to avoid magic numbers
const EQ_FREQUENCIES = {
  HIGH: 4000,
  MID: 1000,
  LOW: 400,
}

// Custom hook for audio initialization and management
function useAudioEngine() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volumes, setVolumes] = useState<number[]>(() => new Array(TRACKS.length).fill(DEFAULT_VOLUME))
  const [muted, setMuted] = useState<boolean[]>(() => new Array(TRACKS.length).fill(false))
  const [eq, setEq] = useState<EQSettings[]>(() =>
    TRACKS.map(() => ({ HIGH: DEFAULT_VOLUME, MID: DEFAULT_VOLUME, LOW: DEFAULT_VOLUME })),
  )
  const [masterVolume, setMasterVolume] = useState(DEFAULT_VOLUME)
  const [isIOSDevice, setIsIOSDevice] = useState(false)

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const eqNodesRef = useRef<AudioNodes[]>([])
  const masterGainRef = useRef<GainNode | null>(null)
  const initialTrackVolumesRef = useRef<number[]>(new Array(TRACKS.length).fill(DEFAULT_VOLUME))
  const audioInitializedRef = useRef(false)

  // Initialize audio engine
  useEffect(() => {
    // Check if running on iOS
    const iosDevice = isIOS()
    setIsIOSDevice(iosDevice)

    const initAudio = async () => {
      try {
        // Create audio context
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

        // Create master gain node
        masterGainRef.current = audioContextRef.current.createGain()
        masterGainRef.current.gain.value = INITIAL_MASTER_VOLUME / 100
        masterGainRef.current.connect(audioContextRef.current.destination)

        // Create audio elements
        audioRefs.current = TRACKS.map(() => new Audio())
        eqNodesRef.current = TRACKS.map(() => ({
          source: null,
          high: null,
          mid: null,
          low: null,
          gain: null,
          buffer: null,
          bufferSource: null,
        }))

        // Load and configure all tracks in parallel
        await Promise.all(
          TRACKS.map(async (track, i) => {
            const audio = audioRefs.current[i]!
            audio.src = track.url
            audio.crossOrigin = "anonymous"
            audio.loop = true
            audio.preload = "auto"

            // Preload audio
            await audio.load()

            // Set up Web Audio API nodes
            const source = audioContextRef.current!.createMediaElementSource(audio)
            const highEQ = audioContextRef.current!.createBiquadFilter()
            const midEQ = audioContextRef.current!.createBiquadFilter()
            const lowEQ = audioContextRef.current!.createBiquadFilter()
            const gainNode = audioContextRef.current!.createGain()

            // Configure filters
            highEQ.type = "highshelf"
            highEQ.frequency.value = EQ_FREQUENCIES.HIGH

            midEQ.type = "peaking"
            midEQ.frequency.value = EQ_FREQUENCIES.MID
            midEQ.Q.value = 1

            lowEQ.type = "lowshelf"
            lowEQ.frequency.value = EQ_FREQUENCIES.LOW

            // Apply the gain boost to normalize volume differences between tracks
            gainNode.gain.value = (initialTrackVolumesRef.current[i] / 100) * track.gainBoost

            // Store the nodes for later use
            eqNodesRef.current[i] = {
              source,
              high: highEQ,
              mid: midEQ,
              low: lowEQ,
              gain: gainNode,
              buffer: null,
              bufferSource: null,
            }

            // Connect the audio nodes
            source.connect(highEQ)
            highEQ.connect(midEQ)
            midEQ.connect(lowEQ)
            lowEQ.connect(gainNode)
            gainNode.connect(masterGainRef.current!)

            // For non-iOS devices, also fetch the buffer for seamless looping
            if (!iosDevice) {
              try {
                const response = await fetch(track.url)
                const arrayBuffer = await response.arrayBuffer()
                const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer)
                eqNodesRef.current[i].buffer = audioBuffer
              } catch (error) {
                console.error(`Failed to load buffer for track ${i}:`, error)
              }
            }
          }),
        )

        audioInitializedRef.current = true
      } catch (error) {
        console.error("Failed to initialize audio engine:", error)
      }
    }

    initAudio()

    // Cleanup function
    return () => {
      // Stop all audio and release resources
      for (const audio of audioRefs.current) {
        if (audio) {
          audio.pause()
          audio.src = ""
        }
      }

      // Stop all buffer sources
      for (const nodes of eqNodesRef.current) {
        if (nodes.bufferSource) {
          try {
            nodes.bufferSource.stop()
          } catch {
            // Ignore errors if already stopped
          }
        }
      }

      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close()
      }
    }
  }, []) // Empty dependency array - only run once on mount

  // Update master volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume / 100
    }
  }, [masterVolume])

  // Handle volume change for a track
  const handleVolumeChange = useCallback(
    (value: number[], index: number) => {
      const newVolume = value[0]

      setVolumes((prev) => {
        const newVolumes = [...prev]
        newVolumes[index] = newVolume
        return newVolumes
      })

      if (eqNodesRef.current[index]?.gain) {
        // Apply volume with the track's gain boost factor
        eqNodesRef.current[index].gain!.gain.value = muted[index] ? 0 : (newVolume / 100) * TRACKS[index].gainBoost
      }
    },
    [muted],
  )

  // Handle EQ change for a track
  const handleEQChange = useCallback((trackIndex: number, band: EQBand, value: number) => {
    setEq((prev) => {
      const newEq = [...prev]
      newEq[trackIndex] = { ...newEq[trackIndex], [band]: value }
      return newEq
    })

    const eqNode = eqNodesRef.current[trackIndex]
    if (eqNode) {
      const gain = ((value - 50) / 50) * 15 // Convert to dB range (-15 to +15)

      switch (band) {
        case "HIGH":
          if (eqNode.high) eqNode.high.gain.value = gain
          break
        case "MID":
          if (eqNode.mid) eqNode.mid.gain.value = gain
          break
        case "LOW":
          if (eqNode.low) eqNode.low.gain.value = gain
          break
      }
    }
  }, [])

  // Toggle mute for a track
  const toggleMute = useCallback(
    (index: number) => {
      setMuted((prev) => {
        const newMuted = [...prev]
        newMuted[index] = !newMuted[index]

        if (eqNodesRef.current[index]?.gain) {
          eqNodesRef.current[index].gain!.gain.value = newMuted[index] ? 0 : (volumes[index] / 100) * TRACKS[index].gainBoost
        }

        return newMuted
      })
    },
    [volumes],
  )

  // Toggle playback for all tracks
  const togglePlayback = useCallback(async () => {
    try {
      // Make sure audio context is running (important for iOS)
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      if (isPlaying) {
        // Stop all audio
        for (const audio of audioRefs.current) {
          if (audio) audio.pause()
        }

        // Stop all buffer sources
        for (const nodes of eqNodesRef.current) {
          if (nodes.bufferSource) {
            try {
              nodes.bufferSource.stop()
            } catch {
              // Ignore errors if already stopped
            }
            nodes.bufferSource = null
          }
        }
      } else {
        // For iOS, use HTML Audio elements
        if (isIOSDevice) {
          for (let index = 0; index < audioRefs.current.length; index++) {
            const audio = audioRefs.current[index]
            if (audio) {
              // Reset the audio to the beginning
              audio.currentTime = 0

              // Apply volume settings
              if (eqNodesRef.current[index]?.gain) {
                eqNodesRef.current[index].gain!.gain.value = muted[index] ? 0 : (volumes[index] / 100) * TRACKS[index].gainBoost
              }

              // Start playback
              const playPromise = audio.play()
              if (playPromise !== undefined) {
                playPromise.catch((error) => {
                  console.error("Error playing audio:", error)
                })
              }
            }
          }
        } else {
          // For other platforms, use buffer sources for seamless looping
          for (let index = 0; index < eqNodesRef.current.length; index++) {
            const nodes = eqNodesRef.current[index]
            if (nodes.buffer) {
              // Create a new buffer source for each playback
              const bufferSource = audioContextRef.current!.createBufferSource()
              bufferSource.buffer = nodes.buffer
              bufferSource.loop = true

              // Connect the buffer source to the EQ chain
              bufferSource.connect(nodes.high!)

              // Update the reference
              nodes.bufferSource = bufferSource

              // Apply current volume settings
              if (nodes.gain) {
                nodes.gain.gain.value = muted[index] ? 0 : (volumes[index] / 100) * TRACKS[index].gainBoost
              }

              // Start playback
              bufferSource.start(0)
            } else {
              // Fallback to HTML Audio if buffer is not available
              const audio = audioRefs.current[index]
              if (audio) {
                audio.currentTime = 0
                const playPromise = audio.play()
                if (playPromise !== undefined) {
                  playPromise.catch((error) => {
                    console.error("Error playing audio:", error)
                  })
                }
              }
            }
          }
        }
      }

      setIsPlaying(!isPlaying)
    } catch (error) {
      console.error("Error toggling playback:", error)
    }
  }, [isPlaying, volumes, muted, isIOSDevice])

  return {
    isPlaying,
    volumes,
    muted,
    eq,
    masterVolume,
    setMasterVolume,
    handleVolumeChange,
    handleEQChange,
    toggleMute,
    togglePlayback,
  }
}

// Extract common knob logic into a custom hook
function useKnob(initialValue: number, onChange: (value: number) => void) {
  const knobRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number>(0)
  const startValueRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const [isActive, setIsActive] = useState(false)
  const rotationDegrees = useMemo(() => (initialValue - 50) * 2.7, [initialValue])

  // Track the previous value to detect 10% crossings
  const prevValueRef = useRef<number>(initialValue)

  // Add a sensitivity factor that can be adjusted for mobile
  const sensitivityFactor = 2.5 // Lower value = less sensitive

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      setIsActive(true)
      startYRef.current = e.clientY
      startValueRef.current = initialValue

      // Initialize the previous value
      prevValueRef.current = initialValue

      // Capture pointer to ensure smooth dragging
      knobRef.current?.setPointerCapture(e.pointerId)

      // Ensure audio context is resumed on iOS
      if (window.AudioContext && isIOS()) {
        const tempContext = new AudioContext()
        tempContext.resume().then(() => tempContext.close())
      }
    },
    [initialValue],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      const deltaY = startYRef.current - e.clientY

      // Adjust sensitivity based on device type
      const adjustedDelta = deltaY / sensitivityFactor

      // Use a non-linear curve for more precise control
      const newValue = Math.max(0, Math.min(100, startValueRef.current + adjustedDelta))
      const roundedValue = Math.round(newValue)

      // Get the 10% markers for previous and current values
      const prevTenth = Math.floor(prevValueRef.current / 10)
      const currentTenth = Math.floor(roundedValue / 10)

      // Only vibrate when crossing a 10% boundary
      if (prevTenth !== currentTenth) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30) // Vibration for 10% increment
        }
      }

      // Update the previous value reference
      prevValueRef.current = roundedValue

      // Call the onChange handler
      onChange(roundedValue)
    },
    [onChange],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsActive(false)
      knobRef.current?.releasePointerCapture(e.pointerId)
    }
  }, [])

  const handleDoubleClick = useCallback(() => {
    // Reset to 50% on double click
    onChange(50)

    // Update the previous value reference
    prevValueRef.current = 50

    // Trigger vibration if supported by the browser
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([40, 60, 40]) // Stronger pattern vibration for reset
    }
  }, [onChange])

  // Add touch-specific handlers for better mobile experience
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault()
        isDraggingRef.current = true
        setIsActive(true)
        startYRef.current = e.touches[0].clientY
        startValueRef.current = initialValue

        // Initialize the previous value
        prevValueRef.current = initialValue

        // Ensure audio context is resumed on iOS
        if (window.AudioContext && isIOS()) {
          const tempContext = new AudioContext()
          tempContext.resume().then(() => tempContext.close())
        }
      }
    },
    [initialValue],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return

      const deltaY = startYRef.current - e.touches[0].clientY

      // Use a more conservative sensitivity for touch
      const touchSensitivity = sensitivityFactor * 1.5
      const adjustedDelta = deltaY / touchSensitivity

      const newValue = Math.max(0, Math.min(100, startValueRef.current + adjustedDelta))
      const roundedValue = Math.round(newValue)

      // Get the 10% markers for previous and current values
      const prevTenth = Math.floor(prevValueRef.current / 10)
      const currentTenth = Math.floor(roundedValue / 10)

      // Only vibrate when crossing a 10% boundary
      if (prevTenth !== currentTenth) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30) // Vibration for 10% increment
        }
      }

      // Update the previous value reference
      prevValueRef.current = roundedValue

      onChange(roundedValue)
      e.preventDefault() // Prevent scrolling while adjusting
    },
    [onChange],
  )

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false
    setIsActive(false)
  }, [])

  return {
    knobRef,
    rotationDegrees,
    isActive,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel: handlePointerUp,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}

// EQ Knob component
const EQKnob = memo(function EQKnob({
  value,
  onChange,
  band,
  trackIndex,
}: {
  value: number
  onChange: (trackIndex: number, band: EQBand, value: number) => void
  band: EQBand
  trackIndex: number
}) {
  const handleChange = useCallback(
    (newValue: number) => {
      onChange(trackIndex, band, newValue)
    },
    [onChange, trackIndex, band],
  )

  const {
    knobRef,
    rotationDegrees,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useKnob(value, handleChange)

  return (
    <div
      ref={knobRef}
      suppressHydrationWarning
      className={cn(
        "relative h-6 w-6 cursor-pointer rounded-full border-neutral-100 border-t-[1px] bg-gradient-to-b from-neutral-300 to-neutral-300/20 shadow-[0px_8px_6px_rgba(0,0,0,0.5)] transition-all",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <div className="h-full w-full rounded-full border-[1px] border-neutral-200/50">
        {/* Position indicator dot */}
        <div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-2.5 w-2.5 transform rounded-full bg-gradient-to-b from-neutral-800 to-neutral-500" />

        {/* Position indicator line */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ transform: `rotate(${rotationDegrees}deg)`, touchAction: "none" }}
        >
          <div className="-translate-x-1/2 -top-[0.7px] absolute left-1/2 h-[8px] w-[3px] transform rounded-t-[0.5px] rounded-b-[0.5px] bg-neutral-700" />
          {/* {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="-z-[1] bg-neutral-300"
              style={{
                transform: `rotate(${i * 12}deg) translateY(-12px)`,
                position: "absolute",
                top: "45%",
                left: "45%",
                transformOrigin: "center",
                width: "2px",
                height: "2px",
                clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              }}
            />
          ))} */}
        </div>
      </div>
    </div>
  )
})

// Master Volume Knob component
const MasterKnob = memo(function MasterKnob({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const {
    knobRef,
    rotationDegrees,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useKnob(value, onChange)

  return (
    <div
      ref={knobRef}
      suppressHydrationWarning
      className={cn(
        "relative z-[10] h-12 w-12 cursor-pointer rounded-full border-[1px] border-neutral-300 bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-[0_10px_12px_0px_rgba(0,0,0,0.6)] transition-all",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <div className="h-full w-full rounded-full border-neutral-100 border-t-[0.5px]">
        {/* <div className="absolute inset-0 rounded-full bg-gradient-to-b from-neutral-300 to-neutral-400" /> */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ transform: `rotate(${rotationDegrees}deg)`, touchAction: "none" }}
        >
          {/* Position indicator dot */}
          <div className="-translate-x-1/2 absolute top-1.5 left-1/2 z-10 h-1 w-1 transform rounded-full bg-gradient-to-b from-neutral-800 to-neutral-600 shadow-sm" />
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className={cn("-z-[1]", i % 2 ? "bg-neutral-300/80" : "bg-neutral-300/50")}
              style={{
                transform: `rotate(${i * 6}deg) translateY(-24px)`,
                position: "absolute",
                top: "21.95px",
                left: "21.5px",
                transformOrigin: "center",
                width: "3px",
                height: "3px",
                // boxShadow: "1px 2px 2px 0px rgba(0, 0, 0, 1)",
                clipPath: "polygon(50% 0%, 100% 50%, 0% 50%)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

// VibrationSlider component to add haptic feedback
const VibrationSlider = memo(function VibrationSlider({
  value,
  onValueChange,
  ...props
}: {
  value: number[]
  onValueChange: (value: number[]) => void
  orientation?: "horizontal" | "vertical"
  min?: number
  max?: number
  step?: number
}) {
  // Track the previous value to detect 10% crossings
  const prevValueRef = useRef<number>(value[0])

  // Update prevValueRef when value prop changes
  useEffect(() => {
    prevValueRef.current = value[0]
  }, [value])

  const handleValueChange = useCallback(
    (newValue: number[]) => {
      // Get the 10% markers for previous and current values
      const prevTenth = Math.floor(prevValueRef.current / 10)
      const currentTenth = Math.floor(newValue[0] / 10)

      // Only vibrate when crossing a 10% boundary
      if (prevTenth !== currentTenth) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30) // Vibration for 10% increment
        }
      }

      // Update the previous value reference
      prevValueRef.current = newValue[0]

      onValueChange(newValue)
    },
    [onValueChange],
  )

  return <Slider value={value} onValueChange={handleValueChange} {...props} />
})

// Track component
const Track = memo(function Track({
  track,
  index,
  volume,
  isMuted,
  eqSettings,
  onVolumeChange,
  onEQChange,
  onMuteToggle,
}: {
  track: TrackType
  index: number
  volume: number
  isMuted: boolean
  eqSettings: EQSettings
  onVolumeChange: (value: number[], index: number) => void
  onEQChange: (trackIndex: number, band: EQBand, value: number) => void
  onMuteToggle: (index: number) => void
}) {
  const { icon: Icon } = track

  return (
    <div className="flex flex-col items-center gap-2">
      {/* EQ Knobs */}
      {EQ_BANDS.map((band) => (
        <EQKnob key={band} band={band} trackIndex={index} value={eqSettings[band]} onChange={onEQChange} />
      ))}

      {/* Fader Track */}
      <div className="mt-2 rounded-full border-neutral-100 border-b-[0.5px] bg-gradient-to-b from-neutral-400 to-neutral-300 p-0.5 shadow-[inset_0px_2px_4px_rgba(0,0,0,1)]">
        <div className="relative h-48 w-3 rounded-full bg-gradient-to-b from-neutral-800/80 to-neutral-800/75 shadow-[inset_0px_2px_4px_rgba(0,0,0,1)]">
          <VibrationSlider
            value={[volume]}
            onValueChange={(value) => onVolumeChange(value, index)}
            orientation="vertical"
            min={0}
            max={100}
            step={1}
          />
        </div>
      </div>

      <Icon className="h-4 w-4 text-neutral-800" />

      {/* Mute Button */}
      <div className="mt-2 rounded-full border-[1px] border-neutral-400">
        <button
          type="button"
          onClick={() => {
            // Trigger vibration if supported by the browser
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(50) // 50ms vibration
            }
            onMuteToggle(index)
          }}
          className={cn(
            "z-[100] flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full border-neutral-200 border-t-[0.5px] bg-gradient-to-b from-neutral-400/80 to-neutral-300 shadow-[0px_3px_3px_rgba(0,0,0,0.2)] active:scale-94",
          )}
        >
          <div className={cn("rounded-full p-0.5", isMuted && "bg-orange-500/10 text-orange-500")}>
            <VolumeOffIcon size={12} className={isMuted ? "text-orange-500" : "text-neutral-700"} />
          </div>
        </button>
      </div>
    </div>
  )
})

// Waveform component (already memoized)
const Waveform = memo(function Waveform({ isPlaying }: { isPlaying: boolean }) {
  const [waveformHeights, setWaveformHeights] = useState(new Array(8).fill(3))

  // Isolated waveform animation effect
  useEffect(() => {
    if (!isPlaying) return

    const animateWaveform = () => {
      setWaveformHeights((prev) => prev.map(() => Math.max(2, Math.min(8, Math.floor(Math.random() * 8)))))
    }

    const interval = setInterval(animateWaveform, 150)
    return () => clearInterval(interval)
  }, [isPlaying])

  if (!isPlaying) {
    return (
      <span className="w-full text-center" style={{ textShadow: "rgba(255,255,255,0.5) 0px 0 1px" }}>
        STOPPED
      </span>
    )
  }

  return (
    <div className="flex items-center justify-center">
      <div className="flex h-2 items-end gap-[1px]">
        {waveformHeights.map((height, i) => (
          <div key={i} className="w-[2px] bg-orange-500 shadow-orange-500/50 shadow-xs" style={{ height: `${height}px` }} />
        ))}
      </div>
    </div>
  )
})

// Extract UI components
const DisplayPanel = memo(function DisplayPanel({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="absolute top-4 right-4 rounded-sm shadow-sm">
      <div className="relative inset-shadow-black inset-shadow-xs flex h-[24px] flex-row items-center justify-start rounded-sm border-[1px] border-neutral-200/80 bg-neutral-800/90 pl-2 font-mono text-[10px] text-neutral-100">
        <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-orange-500/50 shadow-sm" />
        <div className="flex w-[60px] items-center justify-center">
          <Waveform isPlaying={isPlaying} />
        </div>
        <div className="absolute inset-0 rounded-sm bg-[linear-gradient(0deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px)] bg-[size:1px_1px]" />
      </div>
    </div>
  )
})

// PlayButton component
const PlayButton = memo(function PlayButton({ isPlaying, onClick }: { isPlaying: boolean; onClick: () => void }) {
  // Handle click with iOS audio context initialization
  const handleClick = useCallback(() => {
    // Trigger vibration if supported by the browser
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50) // 50ms vibration
    }

    // iOS requires audio context to be created or resumed during a user interaction
    if (isIOS() && window.AudioContext) {
      // Try to resume any existing audio context
      const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      tempContext
        .resume()
        .then(() => {
          // Close the temporary context after resuming
          tempContext.close().catch(() => {
            // Ignore errors on close
          })
        })
        .catch(() => {
          // Ignore errors on resume
        })
    }

    // Call the original onClick handler
    onClick()
  }, [onClick])

  return (
    <div className="relative rounded-full bg-gradient-to-b from-neutral-400/80 to-neutral-300 p-1">
      <div className={cn("rounded-full border-[0.5px] border-neutral-500")}>
        <button
          type="button"
          onClick={handleClick}
          suppressHydrationWarning
          className={cn(
            "group flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-neutral-400/50 p-0.5 transition",
            isPlaying
              ? "scale-96 shadow-[0_3px_5px_0px_rgba(0,0,0,0.3)] active:scale-93"
              : "scale-100 shadow-[0_4px_6px_0px_rgba(0,0,0,0.4)] active:scale-96 active:shadow-[0_3px_5px_0px_rgba(0,0,0,0.3)]",
          )}
        >
          <div className="rounded-full border-t-[0.5px] border-t-neutral-200 border-r-[0.5px] border-r-neutral-300 border-b-[0.5px] border-b-neutral-300 border-l-[0.5px] border-l-neutral-300">
            <div className="flex h-12 w-12 items-start justify-center overflow-hidden rounded-full bg-gradient-to-b from-neutral-500/80 to-neutral-200 pt-2">
              <div
                className={cn(
                  "h-2 w-1 rounded-full border-[0.2px] transition",
                  isPlaying
                    ? "border-transparent bg-orange-500 shadow shadow-orange-500/50"
                    : "border-neutral-50/50 bg-neutral-800",
                )}
              />
            </div>
          </div>
        </button>
      </div>
    </div>
  )
})

const VolumeDisplay = memo(function VolumeDisplay({ volume }: { volume: number }) {
  return (
    <div className="rounded-sm shadow-sm">
      <div className="relative inset-shadow-black inset-shadow-xs flex h-[18px] w-[30px] flex-row items-center justify-center rounded-sm border-[1px] border-neutral-200/80 bg-neutral-800/90 font-mono text-[8px] text-neutral-100">
        {volume}%
        <div className="absolute inset-0 rounded-sm bg-[linear-gradient(0deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px)] bg-[size:1px_1px]" />
      </div>
    </div>
  )
})

// Main AudioMixer component
export function AudioMixer() {
  const {
    isPlaying,
    volumes,
    muted,
    eq,
    masterVolume,
    setMasterVolume,
    handleVolumeChange,
    handleEQChange,
    toggleMute,
    togglePlayback,
  } = useAudioEngine()

  // Add iOS detection and audio context initialization on component mount
  useEffect(() => {
    const iosDevice = isIOS()

    if (iosDevice) {
      // For iOS, we need to create and resume the audio context during a user interaction
      // This is handled in the PlayButton component

      // Add a one-time touch event listener to the document to initialize audio
      const initAudio = () => {
        // This empty function just ensures iOS will allow audio later
        const silentAudio = new Audio(
          "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADmADMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAYAAAAAAAAAAwCVzA1/AAAAAAAAAAAAAAAA",
        )
        silentAudio.volume = 0.001
        silentAudio.play().catch(() => {
          // Ignore errors
        })

        // Remove the event listener after first touch
        document.removeEventListener("touchstart", initAudio)
      }

      document.addEventListener("touchstart", initAudio, { once: true })
    }

    // No cleanup needed as we use { once: true } for the event listener
  }, [])

  return (
    <div className="relative p-4">
      <div className="-inset-4 absolute translate-y-4 rotate-x-12 scale-[0.97] transform rounded-2xl bg-black/30 blur-xl" />
      <div
        suppressHydrationWarning
        className="after:-inset-[2px] after:-bottom-[6px] after:-z-10 rotateX(10deg) rotateY(10deg) relative scale-100 transform rounded-lg bg-gradient-to-b from-neutral-100 to-neutral-400 p-8 shadow-[0_20px_25px_rgba(0,0,0,0.2),0_2px_0_1px_rgba(0,0,0,0.1)] before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:shadow-[inset_0_1px_3px_rgba(255,255,255,0.9),inset_0_-2px_6px_rgba(0,0,0,0.1)] before:content-[''] after:pointer-events-none after:absolute after:rounded-xl after:border after:border-neutral-400 after:bg-neutral-400/50 after:content-[''] md:scale-120"
      >
        <div className="absolute top-4 left-4 font-medium text-neutral-500 text-sm tracking-wider">J3-C7</div>
        <DisplayPanel isPlaying={isPlaying} />
        <div className="mt-12 flex gap-6">
          {/* Track controls */}
          {TRACKS.map((track, index) => (
            <Track
              key={track.label}
              track={track}
              index={index}
              volume={volumes[index]}
              isMuted={muted[index]}
              eqSettings={eq[index]}
              onVolumeChange={handleVolumeChange}
              onEQChange={handleEQChange}
              onMuteToggle={toggleMute}
            />
          ))}
          {/* Play Button and Master Volume */}
          <div className="flex flex-col items-center gap-4">
            <PlayButton isPlaying={isPlaying} onClick={togglePlayback} />
            {/* Master Volume Control */}
            <div className="flex flex-col items-center gap-2">
              <MasterKnob value={masterVolume} onChange={setMasterVolume} />
              <VolumeDisplay volume={masterVolume} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
