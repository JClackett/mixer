import { AudioMixer } from "../components/audio-mixer"

export default function Page() {
  return (
    <div className="flex h-dvh max-h-screen items-center justify-center bg-neutral-100 p-4 dark:bg-neutral-900">
      <AudioMixer />
    </div>
  )
}
