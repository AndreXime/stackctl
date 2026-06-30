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

async function assertValidService(
   projectPath: string,
   service: string,
): Promise<void> {
   const services = await getComposeServices(projectPath)
   if (!services.includes(service)) {
      throw new Error('Serviço inválido')
   }
}

export async function composeStartService(
   projectPath: string,
   service: string,
): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return

   await assertValidService(projectPath, service)

   const command = await composeCommand(projectPath, `up -d ${service}`)
   await exec(command, { cwd: projectPath })
}

export async function composeStopService(
   projectPath: string,
   service: string,
): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return

   await assertValidService(projectPath, service)

   const command = await composeCommand(projectPath, `stop ${service}`)
   await exec(command, { cwd: projectPath })
}

export async function composeRestartService(
   projectPath: string,
   service: string,
): Promise<void> {
   if (!(await hasComposeFile(projectPath))) return

   await assertValidService(projectPath, service)

   const command = await composeCommand(projectPath, `restart ${service}`)
   await exec(command, { cwd: projectPath })
}

export async function getContainerLogs(containerName: string): Promise<string> {
   const { stdout, stderr } = await exec(
      `docker logs --tail 100 ${containerName}`,
   )
   return stdout + stderr
}

export interface ContainerPort {
   host: string
   container: string
}

export interface ContainerVolume {
   destination: string
   source: string
   type: string
   size: string | null
}

export interface ContainerImageInfo {
   name: string
   size: string
   created: string
}

export interface ContainerDetails {
   ports: ContainerPort[]
   volumes: ContainerVolume[]
   image: ContainerImageInfo | null
}

interface DockerInspectMount {
   Type: string
   Source: string
   Destination: string
   Name?: string
}

interface DockerInspectData {
   Image: string
   Config: { Image: string }
   NetworkSettings: {
      Ports?: Record<string, Array<{ HostIp: string; HostPort: string }> | null>
   }
   Mounts: DockerInspectMount[]
}

interface DockerImageInspectData {
   Size: number
   Created: string
   RepoTags: string[]
}

function formatBytes(bytes: number): string {
   if (bytes === 0) return '0 B'
   const units = ['B', 'KB', 'MB', 'GB', 'TB']
   const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
   )
   const value = bytes / 1024 ** unitIndex
   const decimals = unitIndex === 0 ? 0 : 1
   return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

function formatImageDate(iso: string): string {
   return new Date(iso).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
   })
}

function truncatePath(value: string, maxLength = 48): string {
   if (value.length <= maxLength) return value
   const head = Math.ceil((maxLength - 1) / 2)
   const tail = Math.floor((maxLength - 1) / 2)
   return `${value.slice(0, head)}…${value.slice(-tail)}`
}

function formatVolumeSource(mount: DockerInspectMount): string {
   if (mount.Type === 'volume' && mount.Name) {
      return `volume:${mount.Name}`
   }
   return truncatePath(mount.Source)
}

function parseInspectPorts(
   ports: DockerInspectData['NetworkSettings']['Ports'],
): ContainerPort[] {
   if (!ports) return []

   const result: ContainerPort[] = []

   for (const [containerPort, bindings] of Object.entries(ports)) {
      if (!bindings?.length) continue

      for (const binding of bindings) {
         const hostIp = binding.HostIp || '0.0.0.0'
         const host = binding.HostPort
            ? `${hostIp}:${binding.HostPort}`
            : hostIp
         result.push({ host, container: containerPort })
      }
   }

   return result
}

async function getDirectorySize(dirPath: string): Promise<number | null> {
   try {
      const { stdout } = await exec(`du -sb ${JSON.stringify(dirPath)}`)
      const size = Number(stdout.split('\t')[0])
      return Number.isFinite(size) ? size : null
   } catch {
      return null
   }
}

async function getNamedVolumeSizes(): Promise<Map<string, string>> {
   try {
      const { stdout } = await exec('docker system df -v')
      return parseNamedVolumeSizes(stdout)
   } catch {
      return new Map()
   }
}

function parseNamedVolumeSizes(stdout: string): Map<string, string> {
   const sizes = new Map<string, string>()
   let inVolumes = false
   let passedHeader = false

   for (const line of stdout.split('\n')) {
      if (line.includes('Local Volumes space usage:')) {
         inVolumes = true
         continue
      }

      if (!inVolumes) continue

      if (line.trim() === '') {
         if (passedHeader) break
         continue
      }

      if (line.includes('VOLUME NAME')) {
         passedHeader = true
         continue
      }

      if (!passedHeader) continue

      const parts = line.trim().split(/\s+/)
      if (parts.length < 3) continue

      const size = parts.at(-1)
      const links = parts.at(-2)
      const name = parts.slice(0, -2).join(' ')
      if (!size || !links || !name || !/^\d+$/.test(links)) continue

      sizes.set(name, size)
   }

   return sizes
}

async function getImageInfo(
   imageId: string,
   fallbackName: string,
): Promise<ContainerImageInfo | null> {
   try {
      const { stdout } = await exec(
         `docker image inspect ${JSON.stringify(imageId)} --format '{{json .}}'`,
      )
      const data = JSON.parse(stdout.trim()) as DockerImageInspectData
      const name = data.RepoTags?.[0] ?? fallbackName

      return {
         name,
         size: formatBytes(data.Size),
         created: formatImageDate(data.Created),
      }
   } catch {
      return null
   }
}

export async function getContainerDetails(
   containerName: string,
): Promise<ContainerDetails> {
   const { stdout } = await exec(
      `docker inspect ${JSON.stringify(containerName)} --format '{{json .}}'`,
   )
   const inspect = JSON.parse(stdout.trim()) as DockerInspectData

   const ports = parseInspectPorts(inspect.NetworkSettings.Ports)
   const namedVolumeSizes = await getNamedVolumeSizes()

   const volumes: ContainerVolume[] = []

   for (const mount of inspect.Mounts ?? []) {
      let size: string | null = null

      if (mount.Type === 'volume' && mount.Name) {
         size = namedVolumeSizes.get(mount.Name) ?? null
      } else if (mount.Type !== 'tmpfs' && mount.Source) {
         const bytes = await getDirectorySize(mount.Source)
         size = bytes === null ? null : formatBytes(bytes)
      }

      volumes.push({
         destination: mount.Destination,
         source: formatVolumeSource(mount),
         type: mount.Type,
         size,
      })
   }

   const image = await getImageInfo(inspect.Image, inspect.Config.Image)

   return { ports, volumes, image }
}

async function clearNamedVolumeContents(volumeName: string): Promise<void> {
   await exec(
      `docker run --rm -v ${JSON.stringify(`${volumeName}:/mnt`)} alpine find /mnt -mindepth 1 -delete`,
   )
}

async function clearBindMountContents(sourcePath: string): Promise<void> {
   await exec(`find ${JSON.stringify(sourcePath)} -mindepth 1 -delete`)
}

export async function clearContainerVolumes(
   projectPath: string,
   containerName: string,
   service: string,
): Promise<void> {
   if (!(await hasComposeFile(projectPath))) {
      throw new Error('Projeto sem docker-compose')
   }

   await assertValidService(projectPath, service)

   const { stdout } = await exec(
      `docker inspect ${JSON.stringify(containerName)} --format '{{json .Mounts}}'`,
   )
   const mounts = JSON.parse(stdout.trim()) as DockerInspectMount[]
   const clearable = mounts.filter(
      (mount) => mount.Type !== 'tmpfs' && (mount.Name || mount.Source),
   )

   if (clearable.length === 0) {
      throw new Error('Nenhum volume para limpar')
   }

   await composeStopService(projectPath, service)

   for (const mount of clearable) {
      if (mount.Type === 'volume' && mount.Name) {
         await clearNamedVolumeContents(mount.Name)
      } else if (mount.Type === 'bind' && mount.Source) {
         await clearBindMountContents(mount.Source)
      }
   }
}
