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
      commands (*),
      links (*)
    `)
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'notes', ascending: true })
    .order('created_at', { referencedTable: 'commands', ascending: true })
    .order('created_at', { referencedTable: 'links', ascending: true })

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

  const { data: project, error } = await supabase
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
      sort_order: 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create default empty note and command
  const [noteResult, commandResult] = await Promise.all([
    supabase.from('notes').insert({ project_id: project.id, user_id: user.id, tag: 'Note', content: '' }).select(),
    supabase.from('commands').insert({ project_id: project.id, user_id: user.id, command: '', description: '' }).select(),
  ])

  if (noteResult.error) console.error('Note insert error:', noteResult.error)
  if (commandResult.error) console.error('Command insert error:', commandResult.error)

  return NextResponse.json({ ...project, notes: noteResult.data || [], commands: commandResult.data || [], links: [] })
}
