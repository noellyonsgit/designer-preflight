import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://fixtureproject.supabase.co'
const key =
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpeHR1cmVwcm9qZWN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.FixtureSignatureNotReal0000000000000000000'

export const supabase = createClient(url, key)
