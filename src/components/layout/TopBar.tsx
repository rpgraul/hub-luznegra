import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { DefaultView, Project } from '@/types/database'
import {
  Button,
  Modal,
  TextField,
  Label,
  Input,
  Select,
  ListBox,
  Switch,
  Dropdown,
} from '@heroui/react'
import NotificationBell from '@/components/notifications/NotificationBell'
import AvatarDropdown from '@/components/profile/AvatarDropdown'
import {
  BUILTIN_PRESETS,
  type LayoutState,
  type SavedPreset,
} from '@/lib/layout'

const VIEWS: Array<{ id: DefaultView; label: string; icon: string }> = [
  { id: 'gantt', label: 'Gantt', icon: 'fa-chart-gantt' },
  { id: 'kanban', label: 'Kanban', icon: 'fa-columns' },
  { id: 'lista', label: 'Lista', icon: 'fa-list-ul' },
  { id: 'calendario', label: 'Calendário', icon: 'fa-calendar-days' },
]

interface TopBarProps {
  projects: Project[]
  activeProjectId: string | null
  onProjectChange: (projectId: string | null) => void
  showAllTasks: boolean
  onShowAllChange: (show: boolean) => void
  onCreateProject: () => void
  layout: LayoutState
  onViewClick: (view: DefaultView) => void
  onViewHold: (view: DefaultView) => void
  presets: SavedPreset[]
  onApplyPreset: (scheme: LayoutState) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
}

const ALL_PROJECTS = '__all__'
const HOLD_DELAY = 450

export default function TopBar({
  projects,
  activeProjectId,
  onProjectChange,
  showAllTasks,
  onShowAllChange,
  onCreateProject,
  layout,
  onViewClick,
  onViewHold,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: TopBarProps) {
  const navigate = useNavigate()
  const selectValue = activeProjectId ?? ALL_PROJECTS
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [presetName, setPresetName] = useState('')

  const holdTimer = useRef<number | undefined>(undefined)
  const heldRef = useRef(false)

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current)
    },
    [],
  )

  function pressStart(view: DefaultView) {
    heldRef.current = false
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true
      onViewHold(view)
    }, HOLD_DELAY)
  }

  function pressEnd() {
    window.clearTimeout(holdTimer.current)
  }

  function press(view: DefaultView) {
    if (heldRef.current) {
      heldRef.current = false
      return
    }
    onViewClick(view)
  }

  function handleSavePreset() {
    const name = presetName.trim()
    if (!name) return
    onSavePreset(name)
    setPresetName('')
    setSavePresetOpen(false)
  }

  const activeViews = new Set(layout.views)

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-4 border-b border-primary-foreground/10 bg-primary px-4 text-primary-foreground">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="flex shrink-0 items-center gap-2 text-lg font-semibold"
      >
        <img
          src="/logo.svg"
          alt="Logo da Editora Luz Negra"
          className="h-8 w-auto"
        />
        <span className="hidden sm:inline">Editora Luz Negra</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Select.Root
          selectedKey={selectValue}
          onSelectionChange={(value) =>
            onProjectChange(value === ALL_PROJECTS ? null : (value as string))
          }
          aria-label="Filtrar por projeto"
          className="w-full max-w-xs"
          placeholder={
            projects.length === 0 ? 'Sem projetos' : 'Todos os projetos'
          }
        >
          <Select.Trigger className="w-full border-transparent bg-white/15 text-primary-foreground hover:bg-white/25">
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox.Root>
              {projects.length === 0 ? (
                <ListBox.Item id={ALL_PROJECTS} isDisabled textValue="Nenhum projeto disponível">
                  Nenhum projeto disponível
                </ListBox.Item>
              ) : (
                <>
                  <ListBox.Item id={ALL_PROJECTS} textValue="Todos os projetos">
                    <span className="inline-flex items-center gap-2">
                      <i className="fa-solid fa-layer-group text-muted-foreground" />
                      Todos os projetos
                    </span>
                  </ListBox.Item>
                  {projects.map((project) => (
                    <ListBox.Item key={project.id} id={project.id} textValue={project.name}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        {project.name}
                      </span>
                    </ListBox.Item>
                  ))}
                </>
              )}
            </ListBox.Root>
          </Select.Popover>
        </Select.Root>

        <Button
          variant="outline"
          isIconOnly
          onPress={onCreateProject}
          aria-label="Novo projeto"
          className="border-white/30 bg-transparent text-primary-foreground hover:border-white/50 hover:bg-white/15"
        >
          <i className="fa-solid fa-plus" />
        </Button>
      </div>

      <div
        className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1"
        title="Clique para alternar • Segure para combinar"
      >
        {VIEWS.map((v) => {
          const isActive = activeViews.has(v.id)
          return (
            <Button
              key={v.id}
              variant={isActive ? 'primary' : 'ghost'}
              size="sm"
              className={`gap-2 ${
                isActive
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-primary-foreground/85 hover:bg-white/10'
              }`}
              onPressStart={() => pressStart(v.id)}
              onPressEnd={pressEnd}
              onPress={() => press(v.id)}
              aria-pressed={isActive}
            >
              <i className={`fa-solid ${v.icon}`} />
              <span className="hidden md:inline">{v.label}</span>
            </Button>
          )
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 p-1.5">
        <Switch
          isSelected={showAllTasks}
          onChange={onShowAllChange}
          aria-label="Mostrar todas as tarefas"
          size="sm"
        />
      </div>

      <Dropdown.Root>
        <Dropdown.Trigger>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="Layouts e combinações"
            className="text-primary-foreground/85 hover:bg-white/10"
          >
            <i className="fa-solid fa-sliders text-base" />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Popover>
          <Dropdown.Menu>
            <Dropdown.Item key="__header" isDisabled className="cursor-default opacity-100">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Predefinidos
              </span>
            </Dropdown.Item>
            {BUILTIN_PRESETS.map((preset) => (
              <Dropdown.Item
                key={preset.id}
                onAction={() => onApplyPreset(preset.scheme)}
              >
                <i className="fa-solid fa-layer-group mr-2 text-muted-foreground" />
                {preset.name}
              </Dropdown.Item>
            ))}
            {presets.length > 0 && (
              <>
                <Dropdown.Item key="__mine" isDisabled className="cursor-default opacity-100">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Meus layouts
                  </span>
                </Dropdown.Item>
                {presets.map((preset) => (
                  <Dropdown.Item
                    key={preset.id}
                    onAction={() => onApplyPreset(preset.scheme)}
                  >
                    <i className="fa-solid fa-bookmark mr-2 text-primary" />
                    {preset.name}
                  </Dropdown.Item>
                ))}
                {presets.map((preset) => (
                  <Dropdown.Item
                    key={`${preset.id}-del`}
                    className="text-destructive"
                    onAction={() => onDeletePreset(preset.id)}
                  >
                    <i className="fa-solid fa-trash mr-2" />
                    Remover “{preset.name}”
                  </Dropdown.Item>
                ))}
              </>
            )}
            <Dropdown.Item key="__save" onAction={() => setSavePresetOpen(true)}>
              <i className="fa-solid fa-floppy-disk mr-2" />
              Salvar layout atual…
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>

      <NotificationBell tone="dark" />
      <AvatarDropdown />

      <Modal.Root isOpen={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <Modal.Backdrop />
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-sm">
            <Modal.Header>
              <Modal.Heading>Salvar layout</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <TextField.Root
                value={presetName}
                onChange={setPresetName}
                autoFocus
                isRequired
              >
                <Label>Nome do layout</Label>
                <Input placeholder="ex: Dia a dia" onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSavePreset()
                }} />
              </TextField.Root>
              <p className="text-xs text-muted-foreground">
                {layout.views.length > 1
                  ? `Salvará ${layout.views.length} painéis (${layout.layout === 'row' ? 'lado a lado' : 'empilhados'}).`
                  : 'Salvará a visualização única atual.'}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => setSavePresetOpen(false)}>
                Cancelar
              </Button>
              <Button isDisabled={!presetName.trim()} onPress={handleSavePreset}>
                <i className="fa-solid fa-floppy-disk mr-1" />
                Salvar
              </Button>
            </Modal.Footer>
            <Modal.CloseTrigger />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Root>
    </header>
  )
}