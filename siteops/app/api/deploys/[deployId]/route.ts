import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { deployId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: deploy } = await supabase
    .from('deploys')
    .select('*')
    .eq('id', params.deployId)
    .single()

  if (!deploy) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(deploy)
}
