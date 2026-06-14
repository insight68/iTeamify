import type { Workflow, WorkflowStep } from "./types"

const NAME_KEYS = ["主流程", "流程名称", "流程", "环节", "process", "step", "name", "stage"]
const TRADITIONAL_KEYS = [
  "传统工作事项",
  "传统",
  "传统做法",
  "人工",
  "traditional",
  "manual",
  "current",
  "现状",
]
const DEPARTMENT_KEYS = ["部门", "负责部门", "责任部门", "department", "dept", "owner", "team"]
const AI_KEYS = [
  "AI 数字员工执行事项",
  "AI执行事项",
  "AI",
  "数字员工",
  "智能化",
  "ai",
  "auto",
  "automation",
  "future",
  "目标",
]

function findColumn(
  headers: string[],
  keys: string[],
): number | null {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    if (header == null) continue
    const h = String(header).toLowerCase().trim()
    for (const key of keys) {
      if (h.includes(key.toLowerCase())) {
        return i
      }
    }
  }
  return null
}

function generateId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function parseWorkflowExcel(file: File): Promise<Workflow> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx")
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: "array" })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          reject(new Error("Excel 文件中没有找到工作表"))
          return
        }

        const sheet = workbook.Sheets[sheetName]
        if (!sheet) {
          reject(new Error("Excel 文件损坏或无法读取工作表"))
          return
        }

        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        }) as unknown[][]

        if (rows.length < 2) {
          reject(new Error("Excel 文件数据不足，至少需要表头和一行数据"))
          return
        }

        const headers = rows[0] as string[]
        const nameCol = findColumn(headers, NAME_KEYS)
        const traditionalCol = findColumn(headers, TRADITIONAL_KEYS)
        const departmentCol = findColumn(headers, DEPARTMENT_KEYS)
        const aiCol = findColumn(headers, AI_KEYS)

        if (nameCol === null) {
          reject(
            new Error(
              `无法识别「流程名称」列。请确保表头包含以下关键词之一：${NAME_KEYS.slice(0, 5).join("、")}`,
            ),
          )
          return
        }

        const steps: WorkflowStep[] = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as string[]
          const name = (row[nameCol] ?? "").toString().trim()
          if (!name) continue

          const traditionalTasks =
            traditionalCol !== null
              ? (row[traditionalCol] ?? "").toString().trim()
              : ""
          const department =
            departmentCol !== null
              ? (row[departmentCol] ?? "").toString().trim()
              : ""
          const aiTasks =
            aiCol !== null ? (row[aiCol] ?? "").toString().trim() : ""

          steps.push({
            id: `step-${i}`,
            name,
            department,
            traditionalTasks,
            aiTasks,
            order: steps.length + 1,
          })
        }

        if (steps.length === 0) {
          reject(new Error("未能从 Excel 中解析到任何流程步骤"))
          return
        }

        const title = steps[0]?.name
          ? `${steps[0].name}等流程`
          : file.name.replace(/\.(xlsx?|xls)$/i, "")

        resolve({
          id: generateId(),
          title,
          sourceFileName: file.name,
          createdAt: new Date().toISOString(),
          steps,
        })
      } catch (err) {
        reject(
          err instanceof Error ? err : new Error("Excel 文件解析失败，请检查文件格式"),
        )
      }
    }

    reader.onerror = () => {
      reject(new Error("文件读取失败"))
    }

    reader.readAsArrayBuffer(file)
  })
}
