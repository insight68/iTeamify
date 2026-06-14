"use client"

import { Card, CardContent } from "@teamify/ui/components/ui/card"
import { Badge } from "@teamify/ui/components/ui/badge"
import {
  FolderOpen,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Cloud,
} from "lucide-react"

interface FolderFile {
  name: string
  status: "indexed" | "pending" | "missing"
}

interface FolderGroup {
  name: string
  files: FolderFile[]
  completeness: number
}

interface FileOrganizationViewProps {
  data: Record<string, unknown>
}

const fileStatusIcon: Record<string, React.ReactNode> = {
  indexed: <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />,
  pending: <Circle className="size-3.5 text-amber-400 shrink-0" />,
  missing: <AlertTriangle className="size-3.5 text-red-400 shrink-0" />,
}

export function FileOrganizationView({ data }: FileOrganizationViewProps) {
  const folders = (data.folders as FolderGroup[]) ?? []

  return (
    <div className="space-y-4">
      {/* Folder tree */}
      <div className="space-y-3">
        {folders.map((folder, i) => (
          <Card
            key={i}
            size="sm"
            className="animate-demo-fade-up overflow-hidden"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {/* Folder header */}
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
              <FolderOpen className="size-4 text-purple-500" />
              <span className="text-sm font-medium flex-1">{folder.name}</span>
              <Badge
                variant="secondary"
                className={`text-[10px] ${
                  folder.completeness === 100
                    ? "text-green-600"
                    : folder.completeness === 0
                      ? "text-red-600"
                      : "text-amber-600"
                }`}
              >
                {folder.completeness}%
              </Badge>
            </div>

            {/* Files */}
            <CardContent className="p-3">
              <div className="grid gap-1">
                {folder.files.map((file, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/20 transition-colors"
                  >
                    {fileStatusIcon[file.status] ?? fileStatusIcon.pending}
                    <FileText className="size-3.5 text-muted-foreground shrink-0" />
                    <span
                      className={`text-sm flex-1 truncate ${
                        file.status === "missing"
                          ? "text-red-600 dark:text-red-400"
                          : file.status === "pending"
                            ? "text-amber-600 dark:text-amber-400"
                            : ""
                      }`}
                    >
                      {file.name}
                    </span>
                    {file.status === "indexed" && (
                      <Badge variant="secondary" className="text-[10px] text-green-600">
                        已归档
                      </Badge>
                    )}
                    {file.status === "pending" && (
                      <Badge variant="secondary" className="text-[10px] text-amber-600">
                        待补
                      </Badge>
                    )}
                    {file.status === "missing" && (
                      <Badge variant="secondary" className="text-[10px] text-red-600">
                        缺失
                      </Badge>
                    )}
                  </div>
                ))}
              </div></CardContent>
          </Card>
        ))}
      </div>

      {/* Overall stats */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3 text-green-500" />
          已归档
        </span>
        <span className="inline-flex items-center gap-1">
          <Circle className="size-3 text-amber-400" />
          待补齐
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="size-3 text-red-400" />
          缺失
        </span>
        <span className="inline-flex items-center gap-1">
          <Cloud className="size-3 text-blue-400" />
          云端备份
        </span>
      </div>
    </div>
  )
}
