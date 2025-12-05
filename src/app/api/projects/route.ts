import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      *,
      notes (*),
      commands (*)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      title: body.title,
      description: body.description || null,
      authors: body.authors || [],
      github_url: body.github_url || null,
      local_path: body.local_path || null,
      path_type: body.path_type || 'wsl',
      wsl_distro: body.wsl_distro || 'Ubuntu',
      is_expanded: false,
    })
    .select(`*, notes (*), commands (*)`)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
