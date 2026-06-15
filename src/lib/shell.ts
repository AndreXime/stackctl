import { exec as execCb } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { BASE_DIR } from '../config/env'

export const exec = promisify(execCb)

export async function getSafePath(projectName: string) {
   const baseDir = path.resolve(BASE_DIR)
   const targetPath = path.resolve(baseDir, projectName)
   if (
      targetPath !== baseDir &&
      !targetPath.startsWith(`${baseDir}${path.sep}`)
   ) {
      throw new Error('Path inválido')
   }
   await fs.access(targetPath)
   return targetPath
}
