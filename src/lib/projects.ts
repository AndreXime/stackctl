import fs from 'node:fs/promises'
import { BASE_DIR } from '../config/env'

export async function listProjects(): Promise<string[]> {
   const entries = await fs.readdir(BASE_DIR, { withFileTypes: true })
   return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
}
