import { useEffect, useMemo, useRef } from 'react'
import Gantt from 'frappe-gantt'
import '@/assets/frappe-gantt.css'
import { toast } from '@heroui/react'
import { userColor } from '@/utils/colors'
import { todayIso } from '@/utils/format'
import type { Task } from '@/types/database'

interface GanttViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
}

const BAR_HEIGHT = 32
const PADDING = 16
const ROW_HEIGHT = BAR_HEIGHT + PADDING
const HEADER_HEIGHT = 75

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function GanttView({
  tasks,
  onOpenTask,
  updateTask,
}: GanttViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const undated = !task.start_date && !task.due_date
        return { task, undated }
      }),
    [tasks],
  )

  const ganttTasks = rows.map(({ task, undated }) => ({
    id: task.id,
    name: task.title.length > 36 ? `${task.title.slice(0, 35)}…` : task.title,
    start: task.start_date ?? todayIso(),
    end: task.due_date
      ? addDays(task.due_date, 1)
      : addDays(task.start_date ?? todayIso(), 1),
    progress: task.status === 'done' ? 100 : 0,
    dependencies: task.parent_id ? [task.parent_id] : undefined,
    custom_class:
      task.status === 'done'
        ? 'gantt-done'
        : undated
          ? 'gantt-undated'
          : '',
    color: task.assigned_to ? userColor(task.assigned_to) : '#6B7280',
  }))

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasks.length === 0) return

    const tasksById = new Map(rows.map(({ task }) => [task.id, task]))
    const undatedById = new Map(rows.map(({ task, undated }) => [task.id, undated]))

    const gantt = new Gantt(wrapper, ganttTasks, {
      view_mode: 'Month',
      language: 'pt',
      date_format: 'YYYY-MM-DD',
      bar_height: BAR_HEIGHT,
      padding: PADDING,
      today_button: true,
      snap_at: '1d',
      popup: (gTask) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return ''
        const undated = undatedById.get(String(gTask.id))
        const subtitle = undated
          ? 'Sem prazos definidos'
          : task.status === 'done'
            ? 'Concluída'
            : task.status
        const details = undated
          ? 'Arraste a barra para definir os prazos ou preencha as datas na tabela ao lado.'
          : `${task.start_date ?? '—'} → ${task.due_date ?? '—'}`
        return `
          <div class="gantt-popup">
            <strong>${task.title}</strong>
            <div>${subtitle}</div>
            <div>${details}</div>
          </div>
        `
      },
      on_date_change: (gTask, start, end) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return
        const nextStart = start.toISOString().slice(0, 10)
        const nextDue = addDays(end.toISOString().slice(0, 10), -1)
        void updateTask({
          id: task.id,
          patch: { start_date: nextStart, due_date: nextDue },
        }).catch(() => toast.danger('Não foi possível salvar as datas.'))
      },
    })

    function handleDoubleClick(event: MouseEvent) {
      const target = event.target as Element | null
      const bar = target?.closest?.('.bar-wrapper[data-id]')
      const id = bar?.getAttribute('data-id')
      if (!id) return
      const task = tasksById.get(id)
      if (task) onOpenTask(task)
    }
    wrapper.addEventListener('dblclick', handleDoubleClick)

    return () => {
      gantt.clear()
      gantt.unselect_all()
      wrapper.removeEventListener('dblclick', handleDoubleClick)
      wrapper.innerHTML = ''
    }
  }, [ganttTasks, rows, onOpenTask, updateTask])

  function handleDateChange(
    task: Task,
    field: 'start_date' | 'due_date',
    value: string,
  ) {
    const next = value || null
    const nextStart = field === 'start_date' ? next : task.start_date
    const nextDue = field === 'due_date' ? next : task.due_date
    if (nextStart && nextDue && nextStart > nextDue) {
      toast.danger('A data de início não pode ser depois da conclusão.')
      return
    }
    void updateTask({ id: task.id, patch: { [field]: next } }).catch(() =>
      toast.danger('Não foi possível salvar a data.'),
    )
  }

  const undatedCount = rows.filter(({ undated }) => undated).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-end gap-4 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span>
          <i className="fa-regular fa-hand-pointer mr-1" />
          Duplo clique na barra abre a tarefa
        </span>
        <span>
          <i className="fa-solid fa-arrows-left-right mr-1" />
          Arraste para mover ou ajustar prazos
        </span>
        <span>
          <i className="fa-regular fa-calendar-days mr-1" />
          Digite as datas na tabela ao lado
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-w-max">
          <table className="sticky left-0 z-10 shrink-0 border-r border-border bg-background pb-2 text-xs">
            <thead>
              <tr
                className="border-b border-border bg-background"
                style={{ height: HEADER_HEIGHT }}
              >
                <th className="px-3 text-left font-medium text-muted-foreground">
                  Título
                </th>
                <th className="w-40 px-2 text-left font-medium text-muted-foreground">
                  Início
                </th>
                <th className="w-40 px-2 pr-3 text-left font-medium text-muted-foreground">
                  Conclusão
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ task, undated }) => (
                <tr
                  key={task.id}
                  className="border-b border-border/60"
                  style={{ height: ROW_HEIGHT }}
                >
                  <td className="max-w-52 px-3">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">
                        {task.title}
                      </span>
                      {undated && (
                        <span className="shrink-0 rounded border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                          sem prazo
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2">
                    <input
                      type="date"
                      value={task.start_date ?? ''}
                      aria-label={`Início de ${task.title}`}
                      onChange={(e) =>
                        handleDateChange(task, 'start_date', e.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none transition hover:border-border focus:border-primary focus:bg-background"
                    />
                  </td>
                  <td className="px-2 pr-3">
                    <input
                      type="date"
                      value={task.due_date ?? ''}
                      aria-label={`Conclusão de ${task.title}`}
                      onChange={(e) =>
                        handleDateChange(task, 'due_date', e.target.value)
                      }
                      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none transition hover:border-border focus:border-primary focus:bg-background"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="min-w-0 flex-1" ref={wrapperRef} />
        </div>
      </div>

      {undatedCount > 0 && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          <i className="fa-regular fa-clock mr-1" />
          {undatedCount} tarefa(s) sem prazos aparecem tracejadas — arraste a
          barra ou preencha as datas na tabela.
        </div>
      )}
    </div>
  )
}