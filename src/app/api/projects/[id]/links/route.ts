import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // If link_id is provided, this is an update (used by sendBeacon on page unload)
  if (body.link_id) {
    const { link_id, ...updates } = body
    const { data, error } = await supabase
      .from('links')
      .update(updates)
      .eq('id', link_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // Otherwise, create a new link
  const { data, error } = await supabase
    .from('links')
    .insert({
      id: body.id,
      project_id: params.id,
      user_id: user.id,
      name: body.name || 'New Link',
      description: body.description || '',
      link_type: body.link_type || 'url',
      url: body.url || '',
      path: body.path || '',
      path_type: body.path_type || 'wsl',
      wsl_distro: body.wsl_distro || 'Ubuntu',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { link_id, ...updates } = body

  const { data, error } = await supabase
    .from('links')
    .update(updates)
    .eq('id', link_id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const linkId = searchParams.get('link_id')

  if (!linkId) {
    return NextResponse.json({ error: 'link_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('links')
    .delete()
    .eq('id', linkId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
