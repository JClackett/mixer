"use client"
import { scan } from "react-scan"

// react-scan must be imported before react
import { useEffect } from "react"

export function ReactScan() {
  useEffect(() => {
    scan({ enabled: process.env.NODE_ENV === "development" })
  }, [])

  return <></>
}
