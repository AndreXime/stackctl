import dotenv from 'dotenv'

dotenv.config({ quiet: true })

function requireEnv(name: string): string {
   const value = process.env[name]?.trim()
   if (!value) {
      throw new Error(`${name} não definida no ambiente`)
   }
   return value
}

export const BASE_DIR = requireEnv('PROJECTS_ROOT')
