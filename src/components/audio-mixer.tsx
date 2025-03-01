"use client"

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
    <div className="group relative">
      <div
        ref={knobRef}
        suppressHydrationWarning
        className="relative h-6 w-6 cursor-pointer rounded-full border border-neutral-300 bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-[0_6px_6px_rgba(0,0,0,0.4)] dark:border-neutral-800 dark:from-neutral-600 dark:to-neutral-800"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="h-full w-full rounded-full border-[1px] border-neutral-200/50 dark:border-neutral-700">
          <div
            className="absolute inset-0 rounded-full"
            style={{ transform: `rotate(${rotationDegrees}deg)`, touchAction: "none" }}
          >
            {/* Position indicator dot */}
            <div className="-translate-x-1/2 absolute top-1 left-1/2 h-1 w-1 transform rounded-full bg-neutral-600 dark:bg-neutral-200" />

            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="-z-[1] bg-neutral-300 dark:bg-neutral-800"
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
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
// //.serration {
//     position: absolute;
//     top: 50%;
//     left: 50%;
//     width: 12px;
//     height: 12px;
//     background-color: #222;
//     transform-origin: center;
//     clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
//   }

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
    <div className="group relative">
      <div
        ref={knobRef}
        suppressHydrationWarning
        className="relative h-12 w-12 cursor-pointer rounded-full border border-neutral-300 bg-gradient-to-b from-neutral-300 to-neutral-400 shadow-[0_6px_6px_rgba(0,0,0,0.4)]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="h-full w-full rounded-full border-[1px] border-neutral-200/50 p-1">
          <div
            className="absolute inset-0 rounded-full"
            style={{ transform: `rotate(${rotationDegrees}deg)`, touchAction: "none" }}
          >
            {/* Position indicator dot */}
            <div className="-translate-x-1/2 absolute top-1.5 left-1/2 h-1 w-1 transform rounded-full bg-neutral-600 shadow-sm" />
            {Array.from({ length: 60 }).map((_, i) => (
              <div
                key={i}
                className="-z-[1] bg-neutral-300"
                style={{
                  transform: `rotate(${i * 6}deg) translateY(-24px)`,
                  position: "absolute",
                  top: "21.5px",
                  left: "47%",
                  transformOrigin: "center",
                  width: "3px",
                  height: "3px",
                  clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                }}
              />
            ))}
          </div>
        </div>
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
      <div className="relative mt-2 h-48 w-3 overflow-hidden rounded-full bg-gradient-to-b from-neutral-800/80 to-neutral-800/75 shadow-[inset_0px_2px_4px_rgba(0,0,0,1)]">
        <Slider
          value={[volume]}
          onValueChange={(value) => onVolumeChange(value, index)}
          orientation="vertical"
          min={0}
          max={100}
          step={1}
        />
      </div>

      <Icon className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />

      {/* Mute Button */}
      <div className="mt-2 rounded-full border-[1px] border-neutral-400/70 dark:border-neutral-700 dark:text-neutral-300">
        <button
          type="button"
          onClick={() => onMuteToggle(index)}
          className={cn(
            "z-[100] flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full border-[0.5px] border-neutral-200/50 bg-gradient-to-b from-neutral-400/80 to-neutral-300 shadow-sm active:scale-96 dark:border-neutral-500/70 dark:from-neutral-600 dark:to-neutral-800/60",
          )}
        >
          <VolumeOffIcon
            size={12}
            className={isMuted ? "rounded-full bg-orange-500/10 text-orange-500" : "text-neutral-700 dark:text-neutral-400"}
          />
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
      <div className="-inset-4 absolute translate-y-4 rotate-x-12 scale-[0.97] transform rounded-2xl bg-black/90 blur-xl dark:bg-black/30" />
      <div
        suppressHydrationWarning
        className="after:-inset-[2px] after:-bottom-[6px] after:-z-10 rotateX(10deg) rotateY(10deg) relative scale-120 transform rounded-lg bg-gradient-to-b from-neutral-100 to-neutral-400 p-8 shadow-[0_20px_25px_rgba(0,0,0,0.2),0_2px_0_1px_rgba(0,0,0,0.1)] before:pointer-events-none before:absolute before:inset-0 before:rounded-lg before:shadow-[inset_0_1px_3px_rgba(255,255,255,0.9),inset_0_-2px_6px_rgba(0,0,0,0.1)] before:content-[''] after:pointer-events-none after:absolute after:rounded-xl after:border after:border-neutral-400 after:bg-neutral-400/50 after:content-[''] dark:from-neutral-800 dark:to-neutral-900 dark:after:border-neutral-600 dark:after:bg-neutral-700 dark:before:shadow-[inset_0_1px_3px_rgba(255,255,255,0.1),inset_0_-2px_6px_rgba(0,0,0,0.2)]"
      >
        <div className="absolute top-4 left-4 font-medium text-neutral-500 text-sm tracking-wider dark:text-neutral-400">
          J3-C7
        </div>

        {/* Digital Display */}

        <div className="absolute top-4 right-4 rounded-sm shadow-sm">
          <div className="relative inset-shadow-black inset-shadow-xs flex h-[24px] flex-row items-center justify-start rounded-sm border-[1px] border-neutral-200/80 bg-neutral-800/90 pl-2 font-mono text-[10px] text-neutral-100 dark:border-neutral-700">
            <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shadow-orange-500/50 shadow-sm" />
            <div className="flex w-[60px] items-center justify-center">
              <Waveform isPlaying={isPlaying} />
            </div>
            <div className="absolute inset-0 rounded-sm bg-[linear-gradient(0deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px)] bg-[size:1px_1px]" />
          </div>
        </div>

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
            <div className="relative rounded-full bg-gradient-to-b from-neutral-400/80 to-neutral-300 p-1 dark:from-neutral-700 dark:to-neutral-800">
              <div className="rounded-full border-[0.5px] border-neutral-500">
                <button
                  type="button"
                  onClick={togglePlayback}
                  suppressHydrationWarning
                  className={cn(
                    "group flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-neutral-400 p-0.5 transition",
                    isPlaying
                      ? "scale-96 shadow-[0_3px_5px_0px_rgba(0,0,0,0.3)] active:scale-93"
                      : "scale-100 shadow-[0_4px_6px_0px_rgba(0,0,0,0.4)] active:scale-94 active:shadow-[0_3px_5px_0px_rgba(0,0,0,0.3)]",
                  )}
                >
                  <div className="rounded-full border-[0.5px] border-neutral-300/80">
                    <div className="flex h-12 w-12 items-start justify-center overflow-hidden rounded-full border-neutral-300/50 bg-gradient-to-b from-neutral-500/70 to-neutral-200 pt-2">
                      <div
                        className={cn(
                          "h-2 w-1 rounded-full border-[0.2px] transition",
                          isPlaying
                            ? "border-transparent bg-orange-500 shadow shadow-orange-500/50"
                            : "border-neutral-50/50 bg-neutral-700",
                        )}
                      />
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Master Volume Control */}
            <div className="flex flex-col items-center gap-2">
              <MasterKnob value={masterVolume} onChange={setMasterVolume} />

              {/* Volume percentage indicator */}
              <div className="rounded-sm shadow-sm">
                <div className="relative inset-shadow-black inset-shadow-xs flex h-[20px] w-12 flex-row items-center justify-center rounded-sm border-[1px] border-neutral-200/80 bg-neutral-800/90 font-mono text-[10px] text-neutral-100 dark:border-neutral-700">
                  {masterVolume}%
                  <div className="absolute inset-0 rounded-sm bg-[linear-gradient(0deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(0,0,0,0.1)_0.5px,transparent_0.5px)] bg-[size:1px_1px]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
