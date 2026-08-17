import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './app/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './sqlite.db',
  },
})
