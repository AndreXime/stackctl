import fs from 'node:fs/promises'
import path from 'node:path'
import { exec } from './shell'

export interface ContainerInfo {
   Name: string
   Service?: string
   State?: string
   Status?: string
   Publishers?: Array<{ PublishedPort: number; TargetPort: number }>
}

const COMPOSE_FILES = [
   'compose.yaml',
   'compose.yml',
   'docker-compose.yaml',
   'docker-compose.yml',
] as const

interface DockerPsRow {
   Names: string
   State: string
   Status: string
   Labels: string
}

async function findComposeFile(projectPath: string): Promise<string | null> {
   for (const file of COMPOSE_FILES) {
      try {
         await fs.access(path.join(projectPath, file))
         return file
      } catch {}
   }
   return null
}

async function readComposeFile(projectPath: string): Promise<string | null> {
   const composeFile = await findComposeFile(projectPath)
   if (!composeFile) return null
   return fs.readFile(path.join(projectPath, composeFile), 'utf-8')
}

function parseServicesFromCompose(content: string): string[] {
   const services: string[] = []
   let inServices = false

   for (const line of content.split('\n')) {
      if (/^services:\s*(#.*)?$/.test(line)) {
         inServices = true
         continue
      }

      if (!inServices) continue

      if (/^[a-z][\w-]*:\s*(#.*)?$/.test(line)) break

      const match = line.match(/^ {2}([\w-]+):\s*(#.*)?$/)
      if (match?.[1]) services.push(match[1])
   }

   return services
}

async function hasEnvFile(projectPath: string): Promise<boolean> {
   try {
      await fs.access(path.join(projectPath, '.env'))
      return true
   } catch {
      return false
   }
}

async function composeCommand(
   projectPath: string,
   subcommand: string,
): Promise<string> {
   const envFlag = (await hasEnvFile(projectPath)) ? '--env-file .env ' : ''
   return `docker compose ${envFlag}${subcommand}`
}

async function getComposeProjectName(projectPath: string): Promise<string> {
   try {
      const envContent = await fs.readFile(
         path.join(projectPath, '.env'),
         'utf-8',
      )
      const match = envContent.match(/^COMPOSE_PROJECT_NAME=(.+)$/m)
      if (match?.[1]) {
         return match[1].trim().replace(/^["']|["']$/g, '')
      }
   } catch {
      // sem .env
   }

   return path.basename(projectPath).toLowerCase()
}

function parseComposePs(stdout: string): ContainerInfo[] {
   if (!stdout.trim()) return []

   const jsonString = `[${stdout.trim().split('\n').join(',')}]`
   return JSON.parse(jsonString) as ContainerInfo[]
}

function serviceFromLabels(labels: string): string | undefined {
   const match = labels.match(/com\.docker\.compose\.service=([^,]+)/)
   return match?.[1]
}

function mapDockerPsRow(row: DockerPsRow): ContainerInfo {
   const service = serviceFromLabels(row.Labels)
   const container: ContainerInfo = {
      Name: row.Names,
      State: row.State,
      Status: row.Status,
   }
   if (service) container.Service = service
   return container
}

function parseDockerPs(stdout: string): ContainerInfo[] {
   if (!stdout.trim()) return []

   return stdout
      .trim()
      .split('\n')
      .map((line) => mapDockerPsRow(JSON.parse(line) as DockerPsRow))
}

async function getComposeServices(projectPath: string): Promise<string[]> {
   try {
      const command = await composeCommand(projectPath, 'config --services')
      const { stdout } = await exec(command, { cwd: projectPath })
      const services = stdout.trim().split('\n').filter(Boolean)
      if (services.length > 0) return services
   } catch {
      // fallback abaixo
   }

   const content = await readComposeFile(projectPath)
   return content ? parseServicesFromCompose(content) : []
}

async function getRunningContainers(
   projectPath: string,
): Promise<ContainerInfo[]> {
   try {
      const command = await composeCommand(projectPath, 'ps -a --format json')
      const { stdout } = await exec(command, { cwd: projectPath })
      return parseComposePs(stdout)
   } catch {
      const projectName = await getComposeProjectName(projectPath)
      const { stdout } = await exec(
         `docker ps -a --filter "label=com.docker.compose.project=${projectName}" --format json`,
      )
      return parseDockerPs(stdout)
   }
}

function mergeServicesWithContainers(
   services: string[],
   containers: ContainerInfo[],
): ContainerInfo[] {
   const byService = new Map<string, ContainerInfo>()

   for (const container of containers) {
      const key = container.Service ?? container.Name
      byService.set(key, container)
   }

   return services.map((service) => {
      const existing = byService.get(service)
      if (existing) return existing

      return {
         Name: service,
         Service: service,
         State: 'not created',
         Status: 'não criado',
      }
   })
}

export async function hasComposeFile(projectPath: string): Promise<boolean> {
   return (await findComposeFile(projectPath)) !== null
}

export async function getContainers(
   projectPath: string,
): Promise<ContainerInfo[]> {
   if (!(await hasComposeFile(projectPath))) return []

   const services = await getComposeServices(projectPath)
   const containers = await getRunningContainers(projectPath)

   if (services.length > 0) {
      return mergeServicesWithContainers(services, containers)
   }

   return containers
}

export async function composeUp(projectPath: string): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return
   const command = await composeCommand(projectPath, 'up -d')
   await exec(command, { cwd: projectPath })
}

export async function composeDown(projectPath: string): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return
   const command = await composeCommand(projectPath, 'down')
   await exec(command, { cwd: projectPath })
}

export async function composeStartService(
   projectPath: string,
   service: string,
): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return

   const services = await getComposeServices(projectPath)
   if (!services.includes(service)) {
      throw new Error('Serviço inválido')
   }

   const command = await composeCommand(projectPath, `up -d ${service}`)
   await exec(command, { cwd: projectPath })
}

export async function getContainerLogs(containerName: string): Promise<string> {
   const { stdout, stderr } = await exec(
      `docker logs --tail 100 ${containerName}`,
   )
   return stdout + stderr
}
