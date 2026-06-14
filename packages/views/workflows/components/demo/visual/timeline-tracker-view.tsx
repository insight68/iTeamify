"use client"

import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import { Clock, CheckCircle2, Circle, AlertTriangle, Sparkles } from "lucide-react"

interface TimelineEvent {
  time: string
  title: string
  description: string
  status: "completed" | "in-progress" | "pending" | "alert"
  isPredicted?: boolean
}

interface TimelineTrackerViewProps {
  data: Record<string, unknown>
}

const statusConfig: Record<
  string,
  { icon: React.ReactNode; lineClass: string; dotClass: string }
> = {
  completed: {
    icon: <CheckCircle2 className="size-5 text-green-500" />,
    lineClass: "bg-green-300 dark:bg-green-700",
    dotClass: "bg-green-500 ring-4 ring-green-100 dark:ring-green-900/30",
  },
  "in-progress": {
    icon: <Clock className="size-5 text-blue-500 animate-pulse" />,
    lineClass: "bg-blue-300 dark:bg-blue-700",
    dotClass: "bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-900/30",
  },
  pending: {
    icon: <Circle className="size-5 text-muted-foreground/40" />,
    lineClass: "bg-border",
    dotClass: "bg-muted-foreground/30 ring-4 ring-muted/20",
  },
  alert: {
    icon: <AlertTriangle className="size-5 text-red-500" />,
    lineClass: "bg-red-300 dark:bg-red-700",
    dotClass: "bg-red-500 ring-4 ring-red-100 dark:ring-red-900/30",
  },
}

export function TimelineTrackerView({ data }: TimelineTrackerViewProps) {
  const events = (data.events as TimelineEvent[]) ?? []

  return (
    <div className="space-y-1">
      {events.map((event, i) => {
        const config = statusConfig[event.status]
        if (!config) return null
        const isLast = i === events.length - 1

        return (
          <div
            key={i}
            className="flex gap-4 animate-demo-fade-up"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full ${config.dotClass}`}
              >
                {config.icon}
              </div>
              {!isLast && <div className={`mt-1 w-0.5 flex-1 ${config.lineClass}`} />}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? "" : ""}`}>
              <Card size="sm" className={event.status === "in-progress" ? "ring-1 ring-blue-500/30" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{event.time}</span>
                    {event.isPredicted && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Sparkles className="mr-1 size-2.5" />
                        AI 预测
                      </Badge>
                    )}
                    {event.status === "in-progress" && (
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        进行中
                      </Badge>
                    )}
                    {event.status === "alert" && (
                      <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        预警
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.description}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )
      })}
    </div>
  )
}
