import { useEffect, useRef } from 'react'
import Gantt from 'frappe-gantt'
import '@/assets/frappe-gantt.css'
import { toast } from 'sonner'
import { userColor } from '@/utils/colors'
import type { Task } from '@/types/database'

interface GanttViewProps {
  tasks: Task[]
  onOpenTask: (task: Task) => void
  updateTask: (args: { id: string; patch: Partial<Task> }) => Promise<unknown>
}

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

  const dated = tasks.filter((task) => task.start_date && task.due_date)
  const undated = tasks.filter((task) => !task.start_date || !task.due_date)

  const ganttTasks = dated.map((task) => ({
    id: task.id,
    name: task.title.length > 36 ? `${task.title.slice(0, 35)}…` : task.title,
    start: task.start_date!,
    end: addDays(task.due_date!, 1),
    progress: task.status === 'done' ? 100 : 0,
    dependencies: task.parent_id ? [task.parent_id] : undefined,
    custom_class: task.status === 'done' ? 'gantt-done' : '',
    color: task.assigned_to ? userColor(task.assigned_to) : '#6B7280',
  }))

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    if (ganttTasks.length === 0) return

    const tasksById = new Map(tasks.map((task) => [task.id, task]))

    const gantt = new Gantt(wrapper, ganttTasks, {
      view_mode: 'Month',
      language: 'pt',
      date_format: 'YYYY-MM-DD',
      bar_height: 32,
      padding: 16,
      today_button: true,
      popup: (gTask) => {
        const task = tasksById.get(String(gTask.id))
        if (!task) return ''
        return `
          <div class="gantt-popup">
            <strong>${task.title}</strong>
            <div>${task.status === 'done' ? 'Concluída' : task.status}</div>
            <div>${task.start_date ?? '—'} → ${task.due_date ?? '—'}</div>
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
        }).catch(() => toast.error('Não foi possível salvar as datas.'))
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
  }, [ganttTasks, tasks, onOpenTask, updateTask])

  if (dated.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Nenhuma tarefa com datas. Defina início e conclusão para ver o Gantt.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-4 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span>
          <i className="fa-regular fa-hand-pointer mr-1" />
          Duplo clique na barra abre a tarefa
        </span>
        <span>
          <i className="fa-solid fa-arrows-left-right mr-1" />
          Arraste as bordas para reposicionar
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div ref={wrapperRef} />
      </div>
      {undated.length > 0 && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          <i className="fa-regular fa-clock mr-1" />
          {undated.length} tarefa(s) sem datas não aparecem no gráfico.
        </div>
      )}
    </div>
  )
}