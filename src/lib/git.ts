import { exec } from './shell'

export interface GitStatus {
   status: string
   needsPull: boolean
}

export async function getGitStatus(projectPath: string): Promise<GitStatus> {
   try {
      await exec('git fetch', { cwd: projectPath })
      const { stdout } = await exec('git status -uno', { cwd: projectPath })
      return {
         status: stdout,
         needsPull:
            stdout.includes('Your branch is behind') ||
            stdout.includes('have diverged'),
      }
   } catch (e: unknown) {
      return {
         status: `Erro no Git: ${e instanceof Error ? e.message : String(e)}`,
         needsPull: false,
      }
   }
}

export async function gitPull(projectPath: string): Promise<void> {
   await exec('git pull', { cwd: projectPath })
}
