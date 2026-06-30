import { Badge, ConfirmInput, Spinner, StatusMessage } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
   type ContainerDetails,
   type ContainerInfo,
   clearContainerVolumes,
   composeDown,
   composeRestartService,
   composeStartService,
   composeStopService,
   composeUp,
   getContainerDetails,
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
   isContainerCreated,
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
   | { type: 'clear-volumes'; service: string; containerName: string }

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
   const [containerDetails, setContainerDetails] =
      useState<ContainerDetails | null>(null)
   const [detailsLoading, setDetailsLoading] = useState(false)
   const [detailsError, setDetailsError] = useState<string | null>(null)
   const selectedContainerRef = useRef<ContainerInfo | null>(null)
   selectedContainerRef.current = selectedContainer
   const detailsRequestId = useRef(0)

   const fetchContainerDetails = useCallback(
      async (container: ContainerInfo) => {
         const requestId = ++detailsRequestId.current

         if (!isContainerCreated(container)) {
            setContainerDetails(null)
            setDetailsError(null)
            setDetailsLoading(false)
            return
         }

         setDetailsLoading(true)
         setDetailsError(null)
         setContainerDetails(null)

         try {
            const details = await getContainerDetails(container.Name)
            if (requestId !== detailsRequestId.current) return
            setContainerDetails(details)
         } catch (e: unknown) {
            if (requestId !== detailsRequestId.current) return
            setDetailsError(e instanceof Error ? e.message : String(e))
         } finally {
            if (requestId === detailsRequestId.current) {
               setDetailsLoading(false)
            }
         }
      },
      [],
   )

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
         const current = selectedContainerRef.current
         if (current) {
            await fetchContainerDetails(current)
         }
      }
   }, [name, fetchContainerDetails])

   useEffect(() => {
      loadProject()
   }, [loadProject])

   useEffect(() => {
      if (!selectedContainer) {
         setContainerDetails(null)
         setDetailsError(null)
         setDetailsLoading(false)
         return
      }

      void fetchContainerDetails(selectedContainer)
   }, [selectedContainer, fetchContainerDetails])

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
            if (action.type === 'clear-volumes') {
               await clearContainerVolumes(
                  targetPath,
                  action.containerName,
                  action.service,
               )
               setStatusMessage(`Volumes de ${action.service} limpos`)
            }

            await loadProject()
         } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
         } finally {
            setRunning(false)
            setPendingAction(null)
            if (action.type === 'clear-volumes') {
               if (selectedContainerRef.current) {
                  await fetchContainerDetails(selectedContainerRef.current)
               }
            } else {
               setSelectedContainer(null)
               setMenuSection('containers')
            }
            setSelectKey((key) => key + 1)
         }
      },
      [name, loadProject, fetchContainerDetails],
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

      const hasClearableVolumes = containerDetails?.volumes.some(
         (volume) => volume.type !== 'tmpfs',
      )

      const options: MenuOption[] = [
         { label: 'Iniciar', value: 'action:start' },
         { label: 'Desligar', value: 'action:stop' },
         { label: 'Restart', value: 'action:restart' },
         { label: 'Logs', value: 'action:logs' },
      ]

      if (hasClearableVolumes) {
         options.push({
            label: 'Limpar volumes',
            value: 'action:clear-volumes',
         })
      }

      options.push({ label: '← Voltar', value: 'back-container' })

      return options
   }, [selectedContainer, containerDetails])

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
               return
            }

            if (value === 'action:clear-volumes') {
               setPendingAction({
                  type: 'clear-volumes',
                  service,
                  containerName: selectedContainer.Name,
               })
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
                 : pendingAction.type === 'clear-volumes'
                   ? `Confirmar limpar volumes de ${pendingAction.service}? Todos os dados serão apagados.`
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
               <Box marginTop={1} flexDirection="column">
                  <Box>
                     <Badge color={containerStatusColor(selectedContainer)}>
                        {containerStatusLabel(selectedContainer)}
                     </Badge>
                     <Text> {containerLabel(selectedContainer)}</Text>
                  </Box>
                  {!isContainerCreated(selectedContainer) ? (
                     <Box marginTop={1}>
                        <Text dimColor>Container ainda não foi criado</Text>
                     </Box>
                  ) : detailsLoading ? (
                     <Box marginTop={1}>
                        <Spinner label="Carregando detalhes..." />
                     </Box>
                  ) : detailsError ? (
                     <Box marginTop={1}>
                        <StatusMessage variant="error">
                           {detailsError}
                        </StatusMessage>
                     </Box>
                  ) : containerDetails ? (
                     <Box marginTop={1} flexDirection="column">
                        <Text bold>Portas</Text>
                        {containerDetails.ports.length > 0 ? (
                           containerDetails.ports.map((port) => (
                              <Text key={`${port.host}-${port.container}`}>
                                 {port.host} → {port.container}
                              </Text>
                           ))
                        ) : (
                           <Text dimColor>Nenhuma porta publicada</Text>
                        )}

                        <Box marginTop={1} flexDirection="column">
                           <Text bold>Volumes</Text>
                           {containerDetails.volumes.length > 0 ? (
                              containerDetails.volumes.map((volume) => (
                                 <Text
                                    key={`${volume.destination}-${volume.source}`}
                                 >
                                    {volume.destination} ← {volume.source}
                                    {volume.size ? ` (${volume.size})` : ''}
                                    {!volume.size && volume.type !== 'tmpfs'
                                       ? ' (tamanho indisponível)'
                                       : ''}
                                 </Text>
                              ))
                           ) : (
                              <Text dimColor>Nenhum volume montado</Text>
                           )}
                        </Box>

                        {containerDetails.image && (
                           <Box marginTop={1}>
                              <Text bold>Imagem </Text>
                              <Text>
                                 {containerDetails.image.name} ·{' '}
                                 {containerDetails.image.size} · atualizada em{' '}
                                 {containerDetails.image.created}
                              </Text>
                           </Box>
                        )}
                     </Box>
                  ) : null}
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
