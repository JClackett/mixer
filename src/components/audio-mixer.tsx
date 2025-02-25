"use client"

import { Slider } from "@/components/ui/slider"
import { AudioLinesIcon, BirdIcon, DropletsIcon, Play, WavesIcon } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState } from "react"

const tracks = [
  {
    url: "/birds.wav",
    label: "BIRDS",
    icon: BirdIcon,
  },
  {
    url: "/waves.wav",
    label: "WAVES",
    icon: WavesIcon,
  },
  {
    url: "/rain.wav",
    label: "RAIN",
    icon: DropletsIcon,
  },
  {
    url: "/noise.wav",
    label: "NOISE",
    icon: AudioLinesIcon,
  },
]

const eqBands = ["HIGH", "MID", "LOW"]

export default function AudioMixer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volumes, setVolumes] = useState(new Array(tracks.length).fill(50))
  const [muted, setMuted] = useState(new Array(tracks.length).fill(false))
  const [eq, setEq] = useState(tracks.map(() => ({ HIGH: 50, MID: 50, LOW: 50 })))
  const [masterVolume, setMasterVolume] = useState(50)
  const draggingKnobRef = useRef<{ track: number; band: string } | null>(null)
  const draggingMasterRef = useRef(false)
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const eqNodesRef = useRef<any[]>([])
  const masterGainRef = useRef<GainNode | null>(null)
  const initialVolumeRef = useRef(75)
  const startYRef = useRef<number>(0)
  const startValueRef = useRef<number>(0)
  const masterRotationRef = useRef((masterVolume - 50) * 3.6)
  const eqRotationRefs = useRef<number[][][]>([])

  useEffect(() => {
    const initAudio = async () => {
      audioContextRef.current = new AudioContext()

      // Create master gain node
      masterGainRef.current = audioContextRef.current.createGain()
      masterGainRef.current.gain.value = initialVolumeRef.current / 100
      masterGainRef.current.connect(audioContextRef.current.destination)

      audioRefs.current = tracks.map(() => new Audio())
      eqNodesRef.current = tracks.map(() => ({
        source: null,
        high: null,
        mid: null,
        low: null,
        gain: null,
      }))

      for (let i = 0; i < tracks.length; i++) {
        const audio = audioRefs.current[i]!
        audio.src = tracks[i].url
        audio.crossOrigin = "anonymous"
        audio.loop = true

        await audio.load() // Wait for audio to load

        // Set up Web Audio API nodes
        const source = audioContextRef.current.createMediaElementSource(audio)
        const highEQ = audioContextRef.current.createBiquadFilter()
        const midEQ = audioContextRef.current.createBiquadFilter()
        const lowEQ = audioContextRef.current.createBiquadFilter()
        const gainNode = audioContextRef.current.createGain()

        // Configure filters
        highEQ.type = "highshelf"
        highEQ.frequency.value = 4000

        midEQ.type = "peaking"
        midEQ.frequency.value = 1000
        midEQ.Q.value = 1

        lowEQ.type = "lowshelf"
        lowEQ.frequency.value = 400

        // Connect nodes to master gain instead of directly to destination
        source.connect(highEQ).connect(midEQ).connect(lowEQ).connect(gainNode).connect(masterGainRef.current)

        eqNodesRef.current[i] = {
          source,
          high: highEQ,
          mid: midEQ,
          low: lowEQ,
          gain: gainNode,
        }
      }
    }

    initAudio()

    return () => {
      for (const audio of audioRefs.current) {
        if (audio) {
          audio.pause()
          audio.src = ""
        }
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Update master volume whenever it changes
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = masterVolume / 100
    }
  }, [masterVolume])

  // Update rotation refs when volume or eq changes
  useEffect(() => {
    masterRotationRef.current = (masterVolume - 50) * 3.6
  }, [masterVolume])

  useEffect(() => {
    // Initialize eqRotationRefs
    if (eqRotationRefs.current.length === 0) {
      eqRotationRefs.current = tracks.map(() => eqBands.map(() => [(50 - 50) * 3.6]))
    }
  }, [])

  useEffect(() => {
    for (let i = 0; i < tracks.length; i++) {
      for (let j = 0; j < eqBands.length; j++) {
        const band = eqBands[j]
        const value = eq[i][band as keyof (typeof eq)[0]]
        if (eqRotationRefs.current[i]?.[j]) {
          // For 50% at top, we rotate 0 degrees at 50 value
          // Value < 50 rotates counter-clockwise, value > 50 rotates clockwise
          eqRotationRefs.current[i][j][0] = (value - 50) * 2.7
        }
      }
    }
  }, [eq])

  const handleVolumeChange = (value: number[], index: number) => {
    const newVolume = value[0]
    setVolumes((prev) => {
      const newVolumes = [...prev]
      newVolumes[index] = newVolume
      return newVolumes
    })

    if (eqNodesRef.current[index]?.gain) {
      eqNodesRef.current[index].gain.gain.value = muted[index] ? 0 : newVolume / 100
    }
  }

  const handleMasterVolumeChange = (value: number[]) => {
    const newVolume = Math.round(value[0])
    setMasterVolume(newVolume)
  }

  const startKnobDrag = (e: React.PointerEvent, trackIndex: number, band: string) => {
    e.preventDefault()
    const bandIndex = eqBands.indexOf(band)
    draggingKnobRef.current = { track: trackIndex, band }
    startYRef.current = e.clientY
    startValueRef.current = eq[trackIndex][band as keyof (typeof eq)[0]]

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault()
      if (draggingKnobRef.current) {
        const deltaY = startYRef.current - e.clientY
        const newValue = Math.max(0, Math.min(100, startValueRef.current + deltaY / 2))

        // Update rotation directly during drag for smooth visuals
        if (eqRotationRefs.current[trackIndex]?.[bandIndex]) {
          eqRotationRefs.current[trackIndex][bandIndex][0] = (newValue - 50) * 2.7
        }

        // Force re-render to update rotation
        handleEQChange(trackIndex, band, newValue)
      }
    }

    const handlePointerUp = () => {
      draggingKnobRef.current = null
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
  }

  const startMasterKnobDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    draggingMasterRef.current = true
    startYRef.current = e.clientY
    startValueRef.current = masterVolume

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault()
      if (draggingMasterRef.current) {
        const deltaY = startYRef.current - e.clientY
        const newValue = Math.max(0, Math.min(100, startValueRef.current + deltaY / 2))

        // Update rotation directly during drag
        masterRotationRef.current = (Math.round(newValue) - 50) * 3.6

        // Update state (this will also trigger the useEffect to update audio)
        handleMasterVolumeChange([newValue])
      }
    }

    const handlePointerUp = () => {
      draggingMasterRef.current = false
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
  }

  const handleEQChange = (trackIndex: number, band: string, value: number) => {
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
          eqNode.high.gain.value = gain
          break
        case "MID":
          eqNode.mid.gain.value = gain
          break
        case "LOW":
          eqNode.low.gain.value = gain
          break
      }
    }
  }

  const toggleMute = (index: number) => {
    setMuted((prev) => {
      const newMuted = [...prev]
      newMuted[index] = !newMuted[index]
      if (eqNodesRef.current[index]?.gain) {
        eqNodesRef.current[index].gain.gain.value = newMuted[index] ? 0 : volumes[index] / 100
      }
      return newMuted
    })
  }

  const togglePlayback = async () => {
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume()
    }

    if (isPlaying) {
      for (const audio of audioRefs.current) {
        audio?.pause()
      }
    } else {
      try {
        await Promise.all(audioRefs.current.map((audio) => audio?.play()))
      } catch (error) {
        console.error("Error playing audio:", error)
      }
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="bg-gradient-to-b from-neutral-100 to-neutral-200 p-8 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.1),inset_0_0_0_1px_rgba(255,255,255,0.5)] relative">
      <div className="absolute top-4 left-4 text-neutral-600 tracking-wider text-sm font-medium">TX-6</div>

      {/* Digital Display */}
      <div className="absolute top-4 right-4 bg-black text-neutral-100 px-3 py-1 rounded-sm text-[10px] font-mono flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
        {isPlaying ? "PLAYING" : "STOPPED"}
      </div>

      <div className="flex gap-6 mt-12">
        {tracks.map((track, index) => (
          <div key={track.label} className="flex flex-col items-center gap-2">
            {/* EQ Knobs */}
            {eqBands.map((band) => (
              <div key={band} className="relative group">
                <div
                  className="w-6 h-6 bg-gradient-to-b from-neutral-200 to-neutral-300 rounded-full border-2 border-neutral-100 relative shadow-md cursor-pointer"
                  style={{
                    transform: `rotate(${eqRotationRefs.current[index]?.[eqBands.indexOf(band)]?.[0] || ((eq[index][band as keyof (typeof eq)[0]] || 50) - 50) * 2.7}deg)`,
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => startKnobDrag(e, index, band)}
                >
                  {/* Position indicator dot at the top */}
                  <div className="absolute top-0 left-1/2 w-1 h-1 bg-black rounded-full transform -translate-x-1/2" />
                </div>
              </div>
            ))}

            {/* Fader Track */}
            <div className="h-48 w-4 rounded-full bg-black relative mt-2 shadow-inner">
              <Slider
                value={[volumes[index]]}
                onValueChange={(value) => handleVolumeChange(value, index)}
                orientation="vertical"
                min={0}
                max={100}
                step={1}
                className="h-full absolute inset-0 [&_[role=slider]]:shadow-md"
              />

              {/* Dotted indicators */}
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="absolute left-10 w-0.5 h-0.5 bg-neutral-500 rounded-full"
                  style={{ top: `${(i + 1) * 20}%` }}
                />
              ))}
            </div>
            <track.icon className="w-4 h-4" />

            {/* Mute Button */}
            <button
              type="button"
              onClick={() => toggleMute(index)}
              className={`mt-2 w-8 h-6 rounded-sm flex items-center justify-center transition-colors ${
                muted[index] ? "bg-orange-500 text-white" : "bg-neutral-300 text-neutral-600 hover:bg-neutral-400"
              }`}
            >
              <span className="text-[8px] font-medium">MUTE</span>
            </button>
          </div>
        ))}

        {/* Play Button and Master Volume */}
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={togglePlayback}
            className="w-12 h-12 bg-gradient-to-b from-neutral-200 to-neutral-300 rounded-full border-4 border-neutral-100 flex items-center justify-center shadow-lg transform transition-transform active:scale-95"
          >
            {isPlaying ? <div className="w-4 h-4 bg-orange-500" /> : <Play className="w-5 h-5 ml-0.5 fill-black" />}
          </button>

          {/* Master Volume Control */}
          <div className="flex flex-col items-center">
            <div
              className="w-16 h-16 bg-gradient-to-b from-neutral-200 to-neutral-300 rounded-full border-4 border-neutral-100 relative shadow-md cursor-pointer"
              style={{
                transform: `rotate(${masterRotationRef.current}deg)`,
                touchAction: "none",
              }}
              onPointerDown={startMasterKnobDrag}
            >
              <div className="absolute -right-1 top-1/2 w-2 h-2 bg-orange-500 rounded-full transform -translate-y-1/2" />
            </div>
            {/* Volume percentage indicator */}
            <div className="mt-1 text-[10px] text-neutral-600 font-mono bg-neutral-200 px-2 py-0.5 rounded-sm w-12 text-center">
              {masterVolume}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
