import { useStdout } from 'ink'

export function useListHeight(reservedLines = 5): number {
   const { stdout } = useStdout()
   return Math.max(3, stdout.rows - reservedLines)
}
