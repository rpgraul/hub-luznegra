import type { Task } from '@/types/database'

/**
 * Filtro "family-wise" de tarefas: mantém uma tarefa se ELA casa com o
 * predicado OU se qualquer ANCESTRAL dela casa (subtarefa que casa mostra
 * o pai — sem isso a linha viraria raiz órfã) OU se qualquer DESCENDENTE
 * casa (pai que casa continua mostrando suas subtarefas).
 *
 * Sem a parte de descendentes, pai com a categoria e subtarefas sem =
 * as subtarefas somem do Gantt/Lista quando o filtro de categoria ativa.
 */
export function filterTasksFamily(
  tasks: Task[],
  matches: (task: Task) => boolean,
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const matchIds = new Set<string>()
  for (const t of tasks) {
    if (matches(t)) matchIds.add(t.id)
  }
  if (matchIds.size === 0) return []
  const keep = new Set<string>(matchIds)

  // 1. Ancestrais de quem casa (a hierarquia visível precisa do pai).
  for (const id of matchIds) {
    let parentId = byId.get(id)?.parent_id ?? null
    let guard = 0
    while (parentId && guard < 50) {
      keep.add(parentId)
      parentId = byId.get(parentId)?.parent_id ?? null
      guard += 1
    }
  }

  // 2. Descendentes de quem casa (pai visível mantém suas subtarefas).
  for (const t of tasks) {
    if (keep.has(t.id)) continue
    let parentId = t.parent_id
    let guard = 0
    while (parentId && guard < 50) {
      if (matchIds.has(parentId)) {
        keep.add(t.id)
        break
      }
      parentId = byId.get(parentId)?.parent_id ?? null
      guard += 1
    }
  }

  return tasks.filter((t) => keep.has(t.id))
}

/**
 * Reorder SOB filtro: permuta os SLOTS globais do subconjunto visível com a
 * nova ordem do arrasto — as tarefas ocultas pelo filtro mantêm seus slots
 * e a ordem relativa global (visíveis × ocultas) preserva.
 *
 * Antes: reordenar com filtro ativo renumerava 0..N apenas a lista VISÍVEL,
 * pisando nos índices das tarefas ocultas e corrompendo a ordem global ao
 * limpar o filtro.
 */
export function applyVisibleOrderToFull<T extends { id: string }>(
  fullList: T[],
  newVisibleOrder: T[],
): T[] {
  const visibleIds = new Set(newVisibleOrder.map((t) => t.id))
  const slots: number[] = []
  fullList.forEach((t, i) => {
    if (visibleIds.has(t.id)) slots.push(i)
  })
  const next = [...fullList]
  newVisibleOrder.forEach((t, i) => {
    const slot = slots[i]
    if (slot !== undefined) next[slot] = t
  })
  return next
}
