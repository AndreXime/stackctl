import { Badge, ConfirmInput, Spinner, StatusMessage } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
   type ContainerInfo,
   composeDown,
   composeRestartService,
   composeStartService,
   composeStopService,
   composeUp,
   getContainers,
   hasComposeFile,
} from '../lib/docker'
import {
   type GitSyncStatus,
   getGitStatus,
   gitPull,
   gitSyncLabel,
} from '../lib/git'
import { getSafePath } from '../lib/shell'
import {
   containerLabel,
   containerStatusColor,
   containerStatusLabel,
} from './container-utils'
import { type MenuOption, MenuSelect } from './MenuSelect'
import { useListHeight } from './use-list-height'

interface ProjectDashboardScreenProps {
   name: string
   onBack: () => void
   onLogs: (containerName: string) => void
}

type PendingAction =
   | { type: 'pull' }
   | { type: 'up' }
   | { type: 'down' }
   | { type: 'start'; service: string }
   | { type: 'stop'; service: string }
   | { type: 'restart'; service: string }

interface ProjectData {
   gitStatus: string
   gitSyncStatus: GitSyncStatus
   hasCompose: boolean
   containers: ContainerInfo[]
}

function gitSyncColor(
   syncStatus: GitSyncStatus,
): 'green' | 'yellow' | 'red' | undefined {
   if (syncStatus === 'atualizado') return 'green'
   if (syncStatus === 'erro') return 'red'
   if (syncStatus === 'desatualizado' || syncStatus === 'divergente') {
      return 'yellow'
   }
   return undefined
}

function truncateGitStatus(status: string, maxLines = 6): string {
   const lines = status.trim().split('\n')
   if (lines.length <= maxLines) return status.trim()
   return `${lines.slice(0, maxLines).join('\n')}\n...`
}

export function ProjectDashboardScreen({
   name,
   onBack,
   onLogs,
}: ProjectDashboardScreenProps) {
   const listHeight = useListHeight(14)
   const [data, setData] = useState<ProjectData | null>(null)
   const [loading, setLoading] = useState(true)
   const [running, setRunning] = useState(false)
   const [error, setError] = useState<string | null>(null)
   const [statusMessage, setStatusMessage] = useState<string | null>(null)
   const [pendingAction, setPendingAction] = useState<PendingAction | null>(
      null,
   )
   const [selectKey, setSelectKey] = useState(0)
   const [menuSection, setMenuSection] = useState<'containers' | 'actions'>(
      'containers',
   )
   const [selectedContainer, setSelectedContainer] =
      useState<ContainerInfo | null>(null)

   const loadProject = useCallback(async () => {
      setLoading(true)
      setError(null)

      try {
         const targetPath = await getSafePath(name)
         const composeAvailable = await hasComposeFile(targetPath)
         const [{ status: gitStatus, syncStatus: gitSyncStatus }, containers] =
            await Promise.all([
               getGitStatus(targetPath),
               composeAvailable
                  ? getContainers(targetPath)
                  : Promise.resolve([]),
            ])

         setData({
            gitStatus,
            gitSyncStatus,
            hasCompose: composeAvailable,
            containers,
         })
      } catch (e: unknown) {
         setError(e instanceof Error ? e.message : String(e))
      } finally {
         setLoading(false)
      }
   }, [name])

   useEffect(() => {
      loadProject()
   }, [loadProject])

   const runAction = useCallback(
      async (action: PendingAction) => {
         setRunning(true)
         setStatusMessage(null)
         setError(null)

         try {
            const targetPath = await getSafePath(name)

            if (action.type === 'pull') {
               await gitPull(targetPath)
               setStatusMessage('Git pull concluído')
            }
            if (action.type === 'up') {
               await composeUp(targetPath)
               setStatusMessage('Stack iniciada')
            }
            if (action.type === 'down') {
               await composeDown(targetPath)
               setStatusMessage('Stack derrubada')
            }
            if (action.type === 'start') {
               await composeStartService(targetPath, action.service)
               setStatusMessage(`Serviço ${action.service} iniciado`)
            }
            if (action.type === 'stop') {
               await composeStopService(targetPath, action.service)
               setStatusMessage(`Serviço ${action.service} desligado`)
            }
            if (action.type === 'restart') {
               await composeRestartService(targetPath, action.service)
               setStatusMessage(`Serviço ${action.service} reiniciado`)
            }

            await loadProject()
         } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
         } finally {
            setRunning(false)
            setPendingAction(null)
            setSelectedContainer(null)
            setMenuSection('containers')
            setSelectKey((key) => key + 1)
         }
      },
      [name, loadProject],
   )

   const containerOptions = useMemo((): MenuOption[] => {
      if (!data?.hasCompose) return []

      return data.containers.map((container) => {
         const label = containerLabel(container)
         return {
            label,
            value: `container:${label}`,
            render: ({ isFocused }) => (
               <Box>
                  {isFocused ? (
                     <Text color="blue">{label} </Text>
                  ) : (
                     <Text>{label} </Text>
                  )}
                  <Badge color={containerStatusColor(container)}>
                     {containerStatusLabel(container)}
                  </Badge>
               </Box>
            ),
         }
      })
   }, [data])

   const containerActionOptions = useMemo((): MenuOption[] => {
      if (!selectedContainer) return []

      return [
         { label: 'Iniciar', value: 'action:start' },
         { label: 'Desligar', value: 'action:stop' },
         { label: 'Restart', value: 'action:restart' },
         { label: 'Logs', value: 'action:logs' },
         { label: '← Voltar', value: 'back-container' },
      ]
   }, [selectedContainer])

   const generalOptions = useMemo((): MenuOption[] => {
      const items: MenuOption[] = [{ label: 'Git Pull', value: 'pull' }]

      if (data?.hasCompose) {
         items.push(
            { label: 'Subir todos os containers', value: 'up' },
            { label: 'Derrubar todos os containers', value: 'down' },
         )
      }

      items.push(
         { label: 'Atualizar', value: 'refresh' },
         { label: '← Voltar', value: 'back' },
      )

      return items
   }, [data])

   const handleSelect = useCallback(
      (value: string) => {
         if (value === 'back') {
            onBack()
            return
         }

         if (value === 'back-container') {
            setSelectedContainer(null)
            setMenuSection('containers')
            setSelectKey((key) => key + 1)
            return
         }

         if (value === 'refresh') {
            loadProject()
            setSelectKey((key) => key + 1)
            return
         }

         if (value === 'pull') {
            setPendingAction({ type: 'pull' })
            return
         }

         if (value === 'up') {
            setPendingAction({ type: 'up' })
            return
         }

         if (value === 'down') {
            setPendingAction({ type: 'down' })
            return
         }

         if (value.startsWith('container:')) {
            const label = value.slice('container:'.length)
            const container = data?.containers.find(
               (item) => containerLabel(item) === label,
            )
            if (container) {
               setSelectedContainer(container)
               setMenuSection('containers')
               setSelectKey((key) => key + 1)
            }
            return
         }

         if (selectedContainer && value.startsWith('action:')) {
            const service = containerLabel(selectedContainer)

            if (value === 'action:start') {
               setPendingAction({ type: 'start', service })
               return
            }

            if (value === 'action:stop') {
               setPendingAction({ type: 'stop', service })
               return
            }

            if (value === 'action:restart') {
               setPendingAction({ type: 'restart', service })
               return
            }

            if (value === 'action:logs') {
               onLogs(selectedContainer.Name)
            }
         }
      },
      [onBack, onLogs, loadProject, data, selectedContainer],
   )

   useInput((_input, key) => {
      if (key.escape && !pendingAction && !running) {
         if (selectedContainer) {
            setSelectedContainer(null)
            setMenuSection('containers')
            setSelectKey((key) => key + 1)
            return
         }
         onBack()
      }
   })

   const confirmLabel = pendingAction
      ? pendingAction.type === 'pull'
         ? 'Confirmar git pull?'
         : pendingAction.type === 'up'
           ? 'Confirmar subir stack?'
           : pendingAction.type === 'down'
             ? 'Confirmar derrubar stack?'
             : pendingAction.type === 'start'
               ? `Confirmar iniciar ${pendingAction.service}?`
               : pendingAction.type === 'stop'
                 ? `Confirmar desligar ${pendingAction.service}?`
                 : `Confirmar restart ${pendingAction.service}?`
      : null

   const gitSyncTextColor = data ? gitSyncColor(data.gitSyncStatus) : undefined
   const sectionListHeight = Math.max(3, Math.floor(listHeight / 2))
   const showMenus = !loading && !running && !pendingAction
   const hasContainerList = Boolean(
      data?.hasCompose && containerOptions.length > 0 && !selectedContainer,
   )
   const containersMenuActive =
      Boolean(selectedContainer) ||
      (hasContainerList && menuSection === 'containers')
   const actionsMenuActive =
      !selectedContainer && (!hasContainerList || menuSection === 'actions')

   return (
      <Box flexDirection="column" height="100%">
         <Text bold color="blue">
            {name}
         </Text>

         <Box marginTop={1} flexDirection="column">
            <Box>
               <Text bold>Git</Text>
               {data &&
                  (gitSyncTextColor ? (
                     <Text color={gitSyncTextColor}>
                        {' '}
                        · {gitSyncLabel(data.gitSyncStatus)}
                     </Text>
                  ) : (
                     <Text dimColor> · {gitSyncLabel(data.gitSyncStatus)}</Text>
                  ))}
            </Box>
            {data?.gitStatus && (
               <Box marginTop={1}>
                  <Text>{truncateGitStatus(data.gitStatus)}</Text>
               </Box>
            )}
         </Box>

         <Box marginTop={1} flexDirection="column">
            <Text bold>Containers</Text>
            {selectedContainer ? (
               <Box marginTop={1}>
                  <Badge color={containerStatusColor(selectedContainer)}>
                     {containerStatusLabel(selectedContainer)}
                  </Badge>
                  <Text> {containerLabel(selectedContainer)}</Text>
               </Box>
            ) : !data?.hasCompose && data ? (
               <Box marginTop={1}>
                  <Text dimColor>Sem docker-compose neste projeto</Text>
               </Box>
            ) : null}
            {showMenus && selectedContainer && (
               <Box marginTop={1}>
                  <MenuSelect
                     key={`actions-${selectKey}`}
                     isActive={containersMenuActive}
                     visibleOptionCount={sectionListHeight}
                     options={containerActionOptions}
                     onChange={handleSelect}
                  />
               </Box>
            )}
            {showMenus && !selectedContainer && data?.hasCompose && (
               <Box marginTop={1}>
                  <MenuSelect
                     key={`containers-${selectKey}`}
                     isActive={containersMenuActive}
                     visibleOptionCount={sectionListHeight}
                     options={containerOptions}
                     onLeaveDown={() => setMenuSection('actions')}
                     onChange={handleSelect}
                  />
               </Box>
            )}
         </Box>

         {showMenus && !selectedContainer && (
            <Box marginTop={1} flexDirection="column">
               <Text bold>Ações</Text>
               <Box marginTop={1}>
                  <MenuSelect
                     key={`general-${selectKey}`}
                     isActive={actionsMenuActive}
                     visibleOptionCount={sectionListHeight}
                     options={generalOptions}
                     onLeaveUp={() => {
                        if (hasContainerList) {
                           setMenuSection('containers')
                        }
                     }}
                     onChange={handleSelect}
                  />
               </Box>
            </Box>
         )}

         <Box marginTop={1} flexDirection="column" flexGrow={1}>
            {loading && <Spinner label="Carregando projeto..." />}
            {running && <Spinner label="Executando..." />}
            {error && (
               <Box marginBottom={1}>
                  <StatusMessage variant="error">{error}</StatusMessage>
               </Box>
            )}
            {statusMessage && !running && (
               <Box marginBottom={1}>
                  <StatusMessage variant="success">
                     {statusMessage}
                  </StatusMessage>
               </Box>
            )}
            {pendingAction && confirmLabel && (
               <Box flexDirection="column" gap={1}>
                  <Text>{confirmLabel}</Text>
                  <ConfirmInput
                     submitOnEnter={false}
                     onConfirm={() => runAction(pendingAction)}
                     onCancel={() => {
                        setPendingAction(null)
                        setSelectKey((key) => key + 1)
                     }}
                  />
               </Box>
            )}
         </Box>

         <Box marginTop={1}>
            <Text dimColor>
               ↑↓ navegar · Enter selecionar · Esc voltar
               {confirmLabel ? ' · Y/n confirmar' : ''}
            </Text>
         </Box>
      </Box>
   )
}
