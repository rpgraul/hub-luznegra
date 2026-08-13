import { Button, Modal } from '@heroui/react'
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
    <Modal.Root isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop />
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.Header>
            <Modal.Heading>Férias registradas</Modal.Heading>
            <p className="text-sm text-muted-foreground">
              Você tem {tasks.length} tarefa(s) atribuída(s) no período{' '}
              {formatDateRange(inicio, fim)}.
            </p>
          </Modal.Header>

          <Modal.Body>
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
          </Modal.Body>

          <Modal.Footer>
            <Button onPress={() => onOpenChange(false)}>Confirmar</Button>
          </Modal.Footer>
          <Modal.CloseTrigger />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Root>
  )
}