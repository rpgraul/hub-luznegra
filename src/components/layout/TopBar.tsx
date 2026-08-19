import { useEffect, useRef, useState } from 'react'
import type { DefaultView, Project } from '@/types/database'
import {
  Button,
  Modal,
  TextField,
  Label,
  Input,
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
  { id: 'lista', label: 'Lista', icon: 'fa-list-ul' },
  { id: 'kanban', label: 'Kanban', icon: 'fa-columns' },
  { id: 'calendario', label: 'Calendário', icon: 'fa-calendar-days' },
]

interface TopBarProps {
  projects: Project[]
  activeProjectId: string | null
  layout: LayoutState
  onViewClick: (view: DefaultView) => void
  onViewHold: (view: DefaultView) => void
  presets: SavedPreset[]
  onApplyPreset: (scheme: LayoutState) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
  onOpenNewTask?: () => void
}

const HOLD_DELAY = 450

export default function TopBar({
  projects,
  activeProjectId,
  layout,
  onViewClick,
  onViewHold,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onOpenNewTask,
}: TopBarProps) {
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
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <header className="relative z-40 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur select-none">
      {/* Left: Breadcrumbs / Active Space */}
      <div className="flex items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <i className="fa-solid fa-folder text-xs text-primary/80" />
          <span>Espaços</span>
          <i className="fa-solid fa-chevron-right text-[9px] text-muted-foreground/60" />
        </div>
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          {activeProject ? (
            <>
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: activeProject.color || '#7b68ee' }}
              />
              <span>{activeProject.name}</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-layer-group text-xs text-primary" />
              <span>Todos os Projetos</span>
            </>
          )}
        </div>
      </div>

      {/* Center: ClickUp-style View Switcher Tabs */}
      <div
        className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/90 p-0.5 shadow-2xs"
        title="Clique para alternar • Segure para combinar visualizações"
      >
        {VIEWS.map((v) => {
          const isActive = activeViews.has(v.id)
          return (
            <button
              key={v.id}
              type="button"
              onMouseDown={() => pressStart(v.id)}
              onMouseUp={pressEnd}
              onMouseLeave={pressEnd}
              onTouchStart={() => pressStart(v.id)}
              onTouchEnd={pressEnd}
              onClick={() => press(v.id)}
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <i className={`fa-solid ${v.icon} text-[11px]`} />
              <span>{v.label}</span>
            </button>
          )
        })}
      </div>

      {/* Right Side: Presets, New Task & User Actions */}
      <div className="flex items-center gap-2">
        {/* Layout Presets Dropdown */}
        <Dropdown.Root>
          <Dropdown.Trigger>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Layouts e combinações"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <i className="fa-solid fa-sliders text-xs" />
              <span className="hidden md:inline">Layouts</span>
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

        {/* ClickUp Style "+ Tarefa" Button */}
        {onOpenNewTask && (
          <Button
            size="sm"
            onPress={onOpenNewTask}
            className="h-8 gap-1.5 rounded-lg bg-[#7b68ee] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#6c5ce7] transition"
          >
            <i className="fa-solid fa-plus text-xs" />
            <span>Tarefa</span>
          </Button>
        )}

        <div className="h-4 w-px bg-border mx-1" />

        <NotificationBell tone="light" />
        <AvatarDropdown />
      </div>

      {/* Save Preset Modal */}
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
                <Input
                  placeholder="ex: Dia a dia"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSavePreset()
                  }}
                />
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