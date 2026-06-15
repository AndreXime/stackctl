import {
   Alert,
   Badge,
   ConfirmInput,
   Select,
   Spinner,
   StatusMessage,
} from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
   type ContainerInfo,
   composeDown,
   composeStartService,
   composeUp,
   getContainers,
   hasComposeFile,
} from '../lib/docker'
import { getGitStatus, gitPull } from '../lib/git'
import { getSafePath } from '../lib/shell'
import {
   containerLabel,
   containerStatusColor,
   containerStatusLabel,
   isContainerCreated,
   isContainerRunning,
} from './container-utils'
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

interface ProjectData {
   gitStatus: string
   needsPull: boolean
   hasCompose: boolean
   containers: ContainerInfo[]
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

   const loadProject = useCallback(async () => {
      setLoading(true)
      setError(null)

      try {
         const targetPath = await getSafePath(name)
         const composeAvailable = await hasComposeFile(targetPath)
         const [{ status: gitStatus, needsPull }, containers] =
            await Promise.all([
               getGitStatus(targetPath),
               composeAvailable
                  ? getContainers(targetPath)
                  : Promise.resolve([]),
            ])

         setData({
            gitStatus,
            needsPull,
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

            await loadProject()
         } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e))
         } finally {
            setRunning(false)
            setPendingAction(null)
            setSelectKey((key) => key + 1)
         }
      },
      [name, loadProject],
   )

   const options = useMemo(() => {
      const items: Array<{ label: string; value: string }> = [
         { label: 'Git Pull', value: 'pull' },
      ]

      if (data?.hasCompose) {
         items.push(
            { label: 'Subir stack', value: 'up' },
            { label: 'Derrubar stack', value: 'down' },
         )
      }

      for (const container of data?.containers ?? []) {
         const label = containerLabel(container)

         if (!isContainerRunning(container)) {
            items.push({
               label: `  ↳ Iniciar ${label}`,
               value: `start:${label}`,
            })
         }

         if (isContainerCreated(container)) {
            items.push({
               label: `  ↳ Logs ${label}`,
               value: `logs:${container.Name}`,
            })
         }
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

         if (value.startsWith('start:')) {
            const service = value.slice('start:'.length)
            setPendingAction({ type: 'start', service })
            return
         }

         if (value.startsWith('logs:')) {
            const containerName = value.slice('logs:'.length)
            onLogs(containerName)
         }
      },
      [onBack, onLogs, loadProject],
   )

   useInput((_input, key) => {
      if (key.escape && !pendingAction && !running) {
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
             : `Confirmar iniciar ${pendingAction.service}?`
      : null

   return (
      <Box flexDirection="column" height="100%">
         <Text bold color="blue">
            {name}
         </Text>

         <Box marginTop={1} flexDirection="column">
            <Text bold>Git</Text>
            {data?.needsPull && (
               <Box marginTop={1}>
                  <Alert variant="warning">
                     Atualizações disponíveis na branch remota
                  </Alert>
               </Box>
            )}
            {data && (
               <Box marginTop={1}>
                  <Text>{truncateGitStatus(data.gitStatus)}</Text>
               </Box>
            )}
         </Box>

         {data?.hasCompose && data.containers.length > 0 && (
            <Box marginTop={1} flexDirection="column">
               <Text bold>Containers</Text>
               <Box marginTop={1} flexDirection="column">
                  {data.containers.map((container) => (
                     <Box key={containerLabel(container)}>
                        <Badge color={containerStatusColor(container)}>
                           {containerStatusLabel(container)}
                        </Badge>
                        <Text> {containerLabel(container)}</Text>
                     </Box>
                  ))}
               </Box>
            </Box>
         )}

         {!data?.hasCompose && data && (
            <Box marginTop={1}>
               <Text dimColor>Sem docker-compose neste projeto</Text>
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
            {!loading && !running && !pendingAction && (
               <Select
                  key={selectKey}
                  visibleOptionCount={listHeight}
                  options={options}
                  onChange={handleSelect}
               />
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
