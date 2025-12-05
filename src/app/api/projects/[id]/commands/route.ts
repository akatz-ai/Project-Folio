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

  // If command_id is provided, this is an update (used by sendBeacon on page unload)
  if (body.command_id) {
    const { data, error } = await supabase
      .from('commands')
      .update({
        command: body.command,
        description: body.description,
      })
      .eq('id', body.command_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  // Otherwise, create a new command
  const { data, error } = await supabase
    .from('commands')
    .insert({
      id: body.id, // Client-generated UUID
      project_id: params.id,
      user_id: user.id,
      command: body.command || '',
      description: body.description || '',
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

  const { data, error } = await supabase
    .from('commands')
    .update({
      command: body.command,
      description: body.description,
    })
    .eq('id', body.command_id)
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
  const commandId = searchParams.get('command_id')

  if (!commandId) {
    return NextResponse.json({ error: 'command_id required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('commands')
    .delete()
    .eq('id', commandId)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
