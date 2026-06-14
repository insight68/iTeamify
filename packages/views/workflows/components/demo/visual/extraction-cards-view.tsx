"use client"

import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import { Zap } from "lucide-react"

interface ExtractionCard {
  label: string
  value: string
  confidence: number
  icon?: string
}

interface ExtractionCardsViewProps {
  data: Record<string, unknown>
}

export function ExtractionCardsView({ data }: ExtractionCardsViewProps) {
  const cards = (data.cards as ExtractionCard[]) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
        <Zap className="size-4" />
        <span className="font-medium">AI 信息提取</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => (
          <Card
            key={i}
            className="animate-demo-fade-up transition-all duration-300"
            style={{ animationDelay: `${i * 80}ms` }}
            size="sm"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                {card.confidence < 90 && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] text-amber-600">
                    {card.confidence}%
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm font-medium">{card.value}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <div className="h-1 flex-1 rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${card.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {card.confidence}%
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
