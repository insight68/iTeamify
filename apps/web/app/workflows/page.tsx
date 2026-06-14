"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/workflows/demo-procurement")
  }, [router])

  return null
}
