import { Alert, Spinner, StatusMessage } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { getContainerLogs } from '../lib/docker'

interface LogsScreenProps {
   project: string
   container: string
   onBack: () => void
}

export function LogsScreen({ project, container, onBack }: LogsScreenProps) {
   const [logs, setLogs] = useState<string | null>(null)
   const [error, setError] = useState<string | null>(null)

   useEffect(() => {
      getContainerLogs(container)
         .then(setLogs)
         .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : 'Erro ao recuperar logs')
         })
   }, [container])

   useInput((_input, key) => {
      if (key.escape || key.return) {
         onBack()
      }
   })

   return (
      <Box flexDirection="column" height="100%">
         <Text bold color="blue">
            Logs · {project}
         </Text>
         <Text dimColor>{container}</Text>

         <Box marginTop={1} flexDirection="column" flexGrow={1}>
            {!logs && !error && <Spinner label="Carregando logs..." />}
            {error && <StatusMessage variant="error">{error}</StatusMessage>}
            {logs === '' && (
               <Alert variant="info">Nenhuma linha de log disponível</Alert>
            )}
            {logs && logs.length > 0 && (
               <Text wrap="wrap">{logs.trimEnd()}</Text>
            )}
         </Box>

         <Box marginTop={1}>
            <Text dimColor>Enter ou Esc voltar</Text>
         </Box>
      </Box>
   )
}
