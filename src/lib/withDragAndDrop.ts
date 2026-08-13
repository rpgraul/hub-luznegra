import dndImport from 'react-big-calendar/lib/addons/dragAndDrop'

type DndModule = typeof dndImport

function unwrapDnd(): DndModule {
  let mod: unknown = dndImport as unknown
  while (
    typeof mod !== 'function' &&
    mod !== null &&
    typeof mod === 'object' &&
    'default' in mod
  ) {
    mod = (mod as { default: unknown }).default
  }
  if (typeof mod !== 'function') {
    throw new Error('Não foi possível carregar o addon dragAndDrop do react-big-calendar.')
  }
  return mod as DndModule
}

export const withDragAndDrop = unwrapDnd()