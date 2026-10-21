import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = process.env.GRAPES_SUPABASE_LOCAL_DIR
if (!directory) throw new Error('GRAPES_SUPABASE_LOCAL_DIR is required')
const path = join(directory, 'supabase/config.toml')
const original = readFileSync(path, 'utf8')
const match = original.match(/^(schemas\s*=\s*)\[[^\n]*\]/m)
if (!match) throw new Error('Supabase CLI config has no API schemas setting')
const next = original.replace(match[0], `${match[1]}["public", "graphql_public", "api"]`)
writeFileSync(path, next)
console.log('Configured ephemeral local API schemas: public, graphql_public, api')
