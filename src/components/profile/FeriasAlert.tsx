import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FeriasTask } from '@/lib/supabaseClient'
import { formatDateRange } from '@/utils/format'

interface FeriasAlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inicio: string
  fim: string
  tasks: FeriasTask[]
}

export default function FeriasAlert({
  open,
  onOpenChange,
  inicio,
  fim,
  tasks,
}: FeriasAlertProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Férias registradas</DialogTitle>
          <DialogDescription>
            Você tem {tasks.length} tarefa(s) atribuída(s) no período{' '}
            {formatDateRange(inicio, fim)}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <p className="text-sm font-medium">{task.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateRange(task.start_date, task.due_date)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          O salvamento não foi bloqueado. As tarefas permanecem atribuídas a
          você — lembre-se de replanejá-las ou reassigná-las.
        </p>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}