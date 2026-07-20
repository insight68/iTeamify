export default function WorkflowsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-svh overflow-y-auto bg-background text-foreground">
      {children}
    </div>
  )
}
