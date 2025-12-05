import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { ProjectWithRelations, NoteTag } from '@/types/database'

export const dynamic = 'force-dynamic'

interface AIAction {
  type: 'add_project' | 'update_project' | 'delete_project' | 'add_note' | 'add_command' | 'search' | 'summarize'
  title?: string
  description?: string
  github_url?: string
  local_path?: string
  project_id?: string
  project_name?: string
  tag?: NoteTag
  content?: string
  command?: string
  query?: string
}

interface AIResponse {
  actions: AIAction[]
  response: string
}

const SYSTEM_PROMPT = `You are a project management assistant for Project Folio. Your job is to help users manage their software projects via natural language.

Parse user requests into structured JSON actions. Always respond with valid JSON:
{
  "actions": [...],
  "response": "Brief, friendly message to the user"
}

Action types:
- "add_project": Create a new project. Fields: title (required), description, github_url, local_path
- "update_project": Update existing project. Fields: project_id OR project_name (for matching), plus fields to update
- "delete_project": Delete a project. Fields: project_id OR project_name
- "add_note": Add a note to a project. Fields: project_id OR project_name, tag (Note/Bug/Feature/Idea), content
- "add_command": Add a quick command. Fields: project_id OR project_name, command, description
- "search": Search projects/notes. Fields: query
- "summarize": Get summary of all projects. No fields needed.

Rules:
1. Match project names flexibly (e.g., "fitness tracker" matches "Fitness Tracker AI")
2. Default tag to "Note" if not specified
3. For bugs, use tag "Bug". For features/todos, use "Feature". For ideas, use "Idea"
4. Keep responses brief and helpful
5. If you can't understand the request, return empty actions with a helpful response
6. Always maintain valid JSON format with double quotes

Current projects context will be provided.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI service not configured. Please add ANTHROPIC_API_KEY.' },
      { status: 500 }
    )
  }

  try {
    const { message, projects } = await req.json()

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    // Build context
    const projectContext = projects.length > 0
      ? `Current projects:\n${projects.map((p: ProjectWithRelations) =>
          `- "${p.title}" (id: ${p.id}): ${p.description || 'No description'} | ${p.notes.length} notes, ${p.commands.length} commands`
        ).join('\n')}`
      : 'No projects yet.'

    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${projectContext}\n\nUser says: "${message}"`,
        },
      ],
    })

    const textContent = response.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })
    }

    let aiResponse: AIResponse
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      aiResponse = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({
        response: "I had trouble understanding that. Could you rephrase it?",
        projects,
      })
    }

    // Execute actions
    const supabase = createServerClient()
    let updatedProjects = [...projects]

    for (const action of aiResponse.actions) {
      // Find project by ID or name
      const findProject = () => {
        if (action.project_id) {
          return updatedProjects.find(p => p.id === action.project_id)
        }
        if (action.project_name) {
          const search = action.project_name.toLowerCase()
          return updatedProjects.find(p =>
            p.title.toLowerCase().includes(search) ||
            search.includes(p.title.toLowerCase())
          )
        }
        return null
      }

      if (action.type === 'add_project' && action.title) {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            user_id: session.user.id,
            title: action.title,
            description: action.description || null,
            github_url: action.github_url || null,
            local_path: action.local_path || null,
          })
          .select(`*, notes (*), commands (*)`)
          .single()

        if (!error && data) {
          updatedProjects = [data, ...updatedProjects]
        }
      } else if (action.type === 'update_project') {
        const project = findProject()
        if (project) {
          const updates: Record<string, unknown> = {}
          if (action.title) updates.title = action.title
          if (action.description) updates.description = action.description
          if (action.github_url) updates.github_url = action.github_url
          if (action.local_path) updates.local_path = action.local_path

          if (Object.keys(updates).length > 0) {
            const { data, error } = await supabase
              .from('projects')
              .update({ ...updates, updated_at: new Date().toISOString() })
              .eq('id', project.id)
              .select(`*, notes (*), commands (*)`)
              .single()

            if (!error && data) {
              updatedProjects = updatedProjects.map(p => p.id === project.id ? data : p)
            }
          }
        }
      } else if (action.type === 'delete_project') {
        const project = findProject()
        if (project) {
          await supabase.from('projects').delete().eq('id', project.id)
          updatedProjects = updatedProjects.filter(p => p.id !== project.id)
        }
      } else if (action.type === 'add_note') {
        const project = findProject()
        if (project) {
          const { data, error } = await supabase
            .from('notes')
            .insert({
              project_id: project.id,
              user_id: session.user.id,
              tag: action.tag || 'Note',
              content: action.content || '',
            })
            .select()
            .single()

          if (!error && data) {
            updatedProjects = updatedProjects.map(p =>
              p.id === project.id
                ? { ...p, notes: [...p.notes, data] }
                : p
            )
          }
        }
      } else if (action.type === 'add_command') {
        const project = findProject()
        if (project) {
          const { data, error } = await supabase
            .from('commands')
            .insert({
              project_id: project.id,
              user_id: session.user.id,
              command: action.command || '',
              description: action.description || '',
            })
            .select()
            .single()

          if (!error && data) {
            updatedProjects = updatedProjects.map(p =>
              p.id === project.id
                ? { ...p, commands: [...p.commands, data] }
                : p
            )
          }
        }
      }
      // search and summarize don't modify data, just return response
    }

    return NextResponse.json({
      response: aiResponse.response,
      projects: updatedProjects,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
