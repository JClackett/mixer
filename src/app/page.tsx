import { AudioMixer } from "../components/audio-mixer"

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center p-4">
      <AudioMixer />
    </div>
  )
}
