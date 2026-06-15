import type { ContainerInfo } from '../lib/docker'

export function containerLabel(container: ContainerInfo): string {
   return container.Service ?? container.Name
}

export function isContainerCreated(container: ContainerInfo): boolean {
   return (container.State ?? '').toLowerCase() !== 'not created'
}

export function isContainerRunning(container: ContainerInfo): boolean {
   const state = (container.State ?? container.Status ?? '').toLowerCase()
   return state.includes('running')
}

export function containerStatusLabel(container: ContainerInfo): string {
   return container.State ?? container.Status ?? 'desconhecido'
}

export function containerStatusColor(
   container: ContainerInfo,
): 'green' | 'red' | 'yellow' | 'blue' {
   const state = containerStatusLabel(container).toLowerCase()
   if (state.includes('running')) return 'green'
   if (state.includes('exit') || state.includes('stopped')) return 'red'
   if (state.includes('not created') || state.includes('não criado')) {
      return 'yellow'
   }
   return 'blue'
}
