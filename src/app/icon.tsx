import { ImageResponse } from "next/og"

// Image metadata
export const size = {
  width: 32,
  height: 32,
}
export const contentType = "image/png"

// Image generation
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "transparent",
        width: size.width,
        height: size.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#FF6900",
          width: size.width - 6,
          height: size.height - 6,
          borderRadius: "50%",
        }}
      />
    </div>,
    {
      ...size,
    },
  )
}
