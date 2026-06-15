import { exec } from './shell'

export type GitSyncStatus =
   | 'atualizado'
   | 'desatualizado'
   | 'divergente'
   | 'sem-upstream'
   | 'erro'

export interface GitStatus {
   status: string
   syncStatus: GitSyncStatus
}

export function gitSyncLabel(syncStatus: GitSyncStatus): string {
   switch (syncStatus) {
      case 'atualizado':
         return 'Atualizado com o remoto'
      case 'desatualizado':
         return 'Desatualizado — há commits no remoto'
      case 'divergente':
         return 'Divergente do remoto'
      case 'sem-upstream':
         return 'Sem branch remota configurada'
      case 'erro':
         return 'Erro ao verificar o Git'
   }
}

async function getTrackingCounts(
   projectPath: string,
): Promise<{ ahead: number; behind: number; hasUpstream: boolean }> {
   try {
      await exec('git rev-parse --abbrev-ref @{upstream}', { cwd: projectPath })
   } catch {
      return { ahead: 0, behind: 0, hasUpstream: false }
   }

   try {
      const { stdout } = await exec(
         'git rev-list --left-right --count @{upstream}...HEAD',
         { cwd: projectPath },
      )
      const [behindRaw, aheadRaw] = stdout.trim().split(/\s+/)
      return {
         behind: Number(behindRaw) || 0,
         ahead: Number(aheadRaw) || 0,
         hasUpstream: true,
      }
   } catch {
      return { ahead: 0, behind: 0, hasUpstream: true }
   }
}

function resolveSyncStatus(tracking: {
   ahead: number
   behind: number
   hasUpstream: boolean
}): GitSyncStatus {
   if (!tracking.hasUpstream) return 'sem-upstream'
   if (tracking.behind === 0) return 'atualizado'
   if (tracking.ahead > 0) return 'divergente'
   return 'desatualizado'
}

export async function getGitStatus(projectPath: string): Promise<GitStatus> {
   try {
      await exec('git fetch', { cwd: projectPath })

      const [{ stdout: changes }, tracking] = await Promise.all([
         exec('git status -uno --porcelain', { cwd: projectPath }),
         getTrackingCounts(projectPath),
      ])

      return {
         status: changes.trim(),
         syncStatus: resolveSyncStatus(tracking),
      }
   } catch (e: unknown) {
      return {
         status: `Erro no Git: ${e instanceof Error ? e.message : String(e)}`,
         syncStatus: 'erro',
      }
   }
}

export async function gitPull(projectPath: string): Promise<void> {
   await exec('git pull', { cwd: projectPath })
}
