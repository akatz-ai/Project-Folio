import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orderedIds } = await req.json()

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 })
  }

  // Update each project's sort_order
  const updates = orderedIds.map((id: string, index: number) =>
    supabase
      .from('projects')
      .update({ sort_order: index })
      .eq('id', id)
      .eq('user_id', user.id)
  )

  await Promise.all(updates)

  return NextResponse.json({ success: true })
}
