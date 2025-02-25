"use client"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { AudioLinesIcon, BirdIcon, DropletsIcon, Play, VolumeOffIcon, WavesIcon } from "lucide-react"
import type React from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

// Define types for better type safety
type Track = {
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
}

// Move constants outside component to prevent recreation on each render
const TRACKS: Track[] = [
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

// Custom hook for audio initialization and management
function useAudioEngine() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volumes, setVolumes] = useState<number[]>(() => new Array(TRACKS.length).fill(DEFAULT_VOLUME))
  const [muted, setMuted] = useState<boolean[]>(() => new Array(TRACKS.length).fill(false))
  const [eq, setEq] = useState<EQSettings[]>(() =>
    TRACKS.map(() => ({ HIGH: DEFAULT_VOLUME, MID: DEFAULT_VOLUME, LOW: DEFAULT_VOLUME })),
  )
  const [masterVolume, setMasterVolume] = useState(DEFAULT_VOLUME)

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const eqNodesRef = useRef<AudioNodes[]>([])
  const masterGainRef = useRef<GainNode | null>(null)
  const initialTrackVolumesRef = useRef<number[]>(new Array(TRACKS.length).fill(DEFAULT_VOLUME))

  // Initialize audio engine
  useEffect(() => {
    const initAudio = async () => {
      try {
        audioContextRef.current = new AudioContext()

        // Create master gain node
        masterGainRef.current = audioContextRef.current.createGain()
        masterGainRef.current.gain.value = INITIAL_MASTER_VOLUME / 100
        masterGainRef.current.connect(audioContextRef.current.destination)

        audioRefs.current = TRACKS.map(() => new Audio())
        eqNodesRef.current = TRACKS.map(() => ({
          source: null,
          high: null,
          mid: null,
          low: null,
          gain: null,
        }))

        // Load and configure all tracks in parallel
        await Promise.all(
          TRACKS.map(async (track, i) => {
            const audio = audioRefs.current[i]!
            audio.src = track.url
            audio.crossOrigin = "anonymous"
            audio.loop = true

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
            highEQ.frequency.value = 4000

            midEQ.type = "peaking"
            midEQ.frequency.value = 1000
            midEQ.Q.value = 1

            lowEQ.type = "lowshelf"
            lowEQ.frequency.value = 400

            // Apply the gain boost to normalize volume differences between tracks
            gainNode.gain.value = (initialTrackVolumesRef.current[i] / 100) * track.gainBoost

            // Connect nodes to master gain
            source.connect(highEQ)
            highEQ.connect(midEQ)
            midEQ.connect(lowEQ)
            lowEQ.connect(gainNode)
            if (masterGainRef.current) gainNode.connect(masterGainRef.current)

            eqNodesRef.current[i] = {
              source,
              high: highEQ,
              mid: midEQ,
              low: lowEQ,
              gain: gainNode,
            }
          }),
        )
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
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume()
      }

      if (isPlaying) {
        for (const audio of audioRefs.current) {
          if (audio) audio.pause()
        }
      } else {
        await Promise.all(
          audioRefs.current.map((audio) => {
            if (audio) return audio.play().catch((err) => console.error("Play error:", err))
            return Promise.resolve()
          }),
        )
      }

      setIsPlaying(!isPlaying)
    } catch (error) {
      console.error("Error toggling playback:", error)
    }
  }, [isPlaying])

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
  const knobRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number>(0)
  const startValueRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const rotationDegrees = useMemo(() => (value - 50) * 2.7, [value])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      startYRef.current = e.clientY
      startValueRef.current = value

      // Capture pointer to ensure smooth dragging
      knobRef.current?.setPointerCapture(e.pointerId)
    },
    [value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      const deltaY = startYRef.current - e.clientY
      const newValue = Math.max(0, Math.min(100, startValueRef.current + deltaY / 2))

      onChange(trackIndex, band, newValue)
    },
    [band, onChange, trackIndex],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      knobRef.current?.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div className="relative group">
      <div
        ref={knobRef}
        suppressHydrationWarning
        className="w-6 h-6 bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 rounded-full border-2 border-neutral-100 dark:border-neutral-600 relative shadow-md cursor-pointer
            after:content-[''] after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.1)]
            dark:after:shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),inset_0_-1px_2px_rgba(0,0,0,0.2)]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            transform: `rotate(${rotationDegrees}deg)`,
            touchAction: "none",
          }}
        >
          {/* Position indicator dot */}
          <div className="absolute top-0 left-1/2 w-1 h-1 bg-black dark:bg-white rounded-full transform -translate-x-1/2" />
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
  const knobRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number>(0)
  const startValueRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const rotationDegrees = useMemo(() => (value - 50) * 3.6 - 90, [value])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      isDraggingRef.current = true
      startYRef.current = e.clientY
      startValueRef.current = value

      // Capture pointer to ensure smooth dragging
      knobRef.current?.setPointerCapture(e.pointerId)
    },
    [value],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return

      const deltaY = startYRef.current - e.clientY
      const newValue = Math.max(0, Math.min(100, startValueRef.current + deltaY / 2))

      onChange(Math.round(newValue))
    },
    [onChange],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      knobRef.current?.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div
      ref={knobRef}
      suppressHydrationWarning
      className="w-16 h-16 bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 rounded-full border-4 border-neutral-100 dark:border-neutral-600 relative 
          shadow-[0_6px_12px_rgba(0,0,0,0.15)] cursor-pointer
          after:content-[''] after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_1px_3px_rgba(255,255,255,0.7),inset_0_-2px_3px_rgba(0,0,0,0.1)]
          dark:after:shadow-[inset_0_1px_3px_rgba(255,255,255,0.1),inset_0_-2px_3px_rgba(0,0,0,0.2)]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="absolute z-10 inset-0 rounded-full"
        style={{
          transform: `rotate(${rotationDegrees}deg)`,
          touchAction: "none",
        }}
      >
        <div className="absolute -right-1 top-1/2 w-2 h-2 bg-orange-500 rounded-full transform -translate-y-1/2" />
      </div>
    </div>
  )
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
  track: Track
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
      <div className="h-48 w-4 rounded-full bg-black relative mt-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)] overflow-hidden border border-neutral-700">
        <Slider
          value={[volume]}
          onValueChange={(value) => onVolumeChange(value, index)}
          orientation="vertical"
          min={0}
          max={100}
          step={1}
          className="h-full absolute inset-0 [&_[role=slider]]:shadow-md"
        />

        {/* Dotted indicators */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="absolute left-10 w-0.5 h-0.5 bg-neutral-500 rounded-full" style={{ top: `${(i + 1) * 20}%` }} />
        ))}
      </div>

      <Icon className="w-4 h-4 text-neutral-800 dark:text-neutral-200" />

      {/* Mute Button */}
      <button
        type="button"
        onClick={() => onMuteToggle(index)}
        className={cn(
          "mt-2 min-w-6 min-h-6 shadow-sm shrink-0 rounded-full flex items-center justify-center transition-colors z-10",
          isMuted
            ? "bg-orange-500 text-white shadow-sm"
            : "border border-neutral-400/70 dark:border-neutral-500/70 dark:text-neutral-300",
        )}
      >
        <VolumeOffIcon size={12} />
      </button>
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
    return <span className="w-full text-center">STOPPED</span>
  }

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-end h-2 gap-[1px]">
        {waveformHeights.map((height, i) => (
          <div key={i} className="w-[2px] bg-orange-500" style={{ height: `${height}px` }} />
        ))}
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

  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Updated drop shadow for dark mode */}
      <div className="absolute -inset-4 bg-black/10 dark:bg-black/30 rounded-2xl blur-xl transform scale-[0.97] translate-y-4 rotate-x-12" />
      <div
        suppressHydrationWarning
        className="bg-gradient-to-b from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 p-8 rounded-lg relative
            shadow-[0_10px_25px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.1)]
            before:content-[''] before:absolute before:inset-0 before:rounded-lg before:shadow-[inset_0_1px_3px_rgba(255,255,255,0.9),inset_0_-2px_6px_rgba(0,0,0,0.1)]
            dark:before:shadow-[inset_0_1px_3px_rgba(255,255,255,0.1),inset_0_-2px_6px_rgba(0,0,0,0.2)]
            after:content-[''] after:absolute after:-inset-[2px] after:-bottom-[6px] after:rounded-xl after:border after:border-neutral-400 dark:after:border-neutral-600 after:-z-10 after:bg-neutral-300 dark:after:bg-neutral-700
            transform rotateX(10deg) rotateY(10deg) scale-[0.98]"
      >
        <div className="absolute top-4 left-4 text-neutral-600 dark:text-neutral-400 tracking-wider text-sm font-medium">
          J3-C7
        </div>

        {/* Digital Display */}
        <div className="absolute top-4 right-4 bg-black pl-2 text-neutral-100 flex-row justify-start h-[24px] rounded-sm text-[10px] font-mono flex items-center shadow-inner">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <div className="flex items-center justify-center w-[60px]">
            <Waveform isPlaying={isPlaying} />
          </div>
        </div>

        <div className="flex gap-6 mt-12">
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
            <button
              type="button"
              onClick={togglePlayback}
              suppressHydrationWarning
              className="w-12 h-12 bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 rounded-full border-4 border-neutral-100 dark:border-neutral-600 flex items-center justify-center 
                  shadow-[0_4px_8px_rgba(0,0,0,0.2)] transform transition-transform active:scale-95 active:shadow-[0_2px_4px_rgba(0,0,0,0.2)]
                  after:content-[''] after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_1px_3px_rgba(255,255,255,0.7),inset_0_-2px_3px_rgba(0,0,0,0.1)]
                  dark:after:shadow-[inset_0_1px_3px_rgba(255,255,255,0.1),inset_0_-2px_3px_rgba(0,0,0,0.2)]"
            >
              {isPlaying ? (
                <div className="w-4 h-4 bg-orange-500" />
              ) : (
                <Play className="w-5 h-5 ml-0.5 fill-black dark:fill-white" />
              )}
            </button>

            {/* Master Volume Control */}
            <div className="flex flex-col items-center">
              <MasterKnob value={masterVolume} onChange={setMasterVolume} />

              {/* Volume percentage indicator */}
              <div className="mt-1 text-[10px] text-neutral-600 dark:text-neutral-400 font-mono bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-sm w-12 text-center">
                {masterVolume}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
