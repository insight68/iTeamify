import { redirect } from "next/navigation"

// Server-side redirect: avoids a client-side round-trip (no "use client" JS
// download + hydration + router.replace). Next.js issues a 302 to the demo
// workflow before any client JS is shipped.
export default function Page() {
  redirect("/source-ai/demo-procurement")
}
