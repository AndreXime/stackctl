import { defaultTheme, ThemeProvider } from '@inkjs/ui'
import { useState } from 'react'
import { LogsScreen } from './LogsScreen'
import { ProjectDashboardScreen } from './ProjectDashboardScreen'
import { ProjectListScreen } from './ProjectListScreen'

type Screen =
   | { type: 'list' }
   | { type: 'project'; name: string }
   | { type: 'logs'; project: string; container: string }

export function App() {
   const [screen, setScreen] = useState<Screen>({ type: 'list' })

   return (
      <ThemeProvider theme={defaultTheme}>
         {screen.type === 'list' && (
            <ProjectListScreen
               onOpen={(name) => setScreen({ type: 'project', name })}
            />
         )}

         {screen.type === 'project' && (
            <ProjectDashboardScreen
               name={screen.name}
               onBack={() => setScreen({ type: 'list' })}
               onLogs={(container) =>
                  setScreen({
                     type: 'logs',
                     project: screen.name,
                     container,
                  })
               }
            />
         )}

         {screen.type === 'logs' && (
            <LogsScreen
               project={screen.project}
               container={screen.container}
               onBack={() =>
                  setScreen({ type: 'project', name: screen.project })
               }
            />
         )}
      </ThemeProvider>
   )
}
