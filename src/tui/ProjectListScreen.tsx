import { Alert, Select, Spinner } from '@inkjs/ui'
import { Box, Text, useApp, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { BASE_DIR } from '../config/env'
import { listProjects } from '../lib/projects'
import { useListHeight } from './use-list-height'

interface ProjectListScreenProps {
   onOpen: (name: string) => void
}

export function ProjectListScreen({ onOpen }: ProjectListScreenProps) {
   const { exit } = useApp()
   const listHeight = useListHeight(6)
   const [projects, setProjects] = useState<string[]>([])
   const [error, setError] = useState<string | null>(null)
   const [loading, setLoading] = useState(true)

   useEffect(() => {
      listProjects()
         .then(setProjects)
         .catch(() => setError(`Erro ao ler ${BASE_DIR}`))
         .finally(() => setLoading(false))
   }, [])

   useInput((input, key) => {
      if (input === 'q' || (key.ctrl && input === 'c')) {
         exit()
      }
   })

   const options = projects.map((name) => ({ label: name, value: name }))

   return (
      <Box flexDirection="column" height="100%">
         <Text bold color="blue">
            Deploy Panel
         </Text>
         <Text dimColor>{BASE_DIR}</Text>
         <Box marginTop={1} flexDirection="column" flexGrow={1}>
            {loading && <Spinner label="Carregando projetos..." />}
            {error && <Alert variant="error">{error}</Alert>}
            {!loading && !error && projects.length === 0 && (
               <Alert variant="warning">Nenhum projeto encontrado</Alert>
            )}
            {!loading && !error && projects.length > 0 && (
               <Select
                  visibleOptionCount={listHeight}
                  options={options}
                  onChange={onOpen}
               />
            )}
         </Box>
         <Box marginTop={1}>
            <Text dimColor>↑↓ navegar · Enter abrir · q sair</Text>
         </Box>
      </Box>
   )
}
