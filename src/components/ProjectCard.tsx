'use client'

import { useState, useRef, useCallback } from 'react'
import { ProjectWithRelations, Note, Command, NoteTag } from '@/types/database'
import { useToast } from './Toast'

interface ProjectCardProps {
  project: ProjectWithRelations
  onUpdate: (projectOrFn: ProjectWithRelations | ((prev: ProjectWithRelations) => ProjectWithRelations)) => void
  onDelete: (id: string) => void
  onEdit: (project: ProjectWithRelations) => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getTimePeriod(dateStr: string) {
  const now = new Date()
  const d = new Date(dateStr)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  if (d >= today) return 'today'
  if (d >= weekAgo) return 'week'
  if (d >= monthAgo) return 'month'
  return 'older'
}

export function ProjectCard({ project, onUpdate, onDelete, onEdit }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(project.is_expanded)
  const [activeTab, setActiveTab] = useState<'notes' | 'commands'>('notes')
  const [tagFilter, setTagFilter] = useState<NoteTag | ''>('')
  const [timeFilter, setTimeFilter] = useState('')
  const { showToast } = useToast()

  // Debounce timers for batching updates
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})
  const pendingUpdates = useRef<Record<string, { type: 'note' | 'command', updates: Record<string, unknown> }>>({})

  // Debounced sync function
  const debouncedSync = useCallback((id: string, type: 'note' | 'command', updates: Record<string, unknown>) => {
    const key = `${type}-${id}`
    pendingUpdates.current[key] = {
      type,
      updates: { ...pendingUpdates.current[key]?.updates, ...updates },
    }

    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key])
    }

    debounceTimers.current[key] = setTimeout(async () => {
      const pending = pendingUpdates.current[key]
      if (!pending) return

      delete pendingUpdates.current[key]
      delete debounceTimers.current[key]

      const endpoint = type === 'note'
        ? `/api/projects/${project.id}/notes`
        : `/api/projects/${project.id}/commands`

      const body = type === 'note'
        ? { note_id: id, ...pending.updates }
        : { command_id: id, ...pending.updates }

      try {
        const res = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const error = await res.json()
          showToast(`Failed to save ${type}: ${error.error || 'Unknown error'}`)
        }
      } catch {
        showToast(`Failed to save ${type}: Network error`)
      }
    }, 500)
  }, [project.id, showToast])

  const toggleExpand = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)

    // Fire and forget - don't block UI
    fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_expanded: newExpanded }),
    }).catch(() => {
      showToast('Failed to save expanded state')
    })
  }

  const openInVSCode = () => {
    let uri = ''
    if (project.path_type === 'wsl') {
      uri = `vscode://vscode-remote/wsl+${project.wsl_distro}${project.local_path}`
    } else {
      uri = `vscode://file/${project.local_path?.replace(/\\/g, '/')}`
    }
    window.open(uri, '_blank')
  }

  const addNote = async () => {
    // Optimistic: create temporary note immediately
    const tempId = `temp-${Date.now()}`
    const tempNote: Note = {
      id: tempId,
      project_id: project.id,
      user_id: '',
      tag: 'Note',
      content: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    onUpdate({ ...project, notes: [...project.notes, tempNote] })

    try {
      const res = await fetch(`/api/projects/${project.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const note = await res.json()
        // Replace temp note with real one - use functional update pattern
        onUpdate(prev => ({
          ...prev,
          notes: prev.notes.map(n => n.id === tempId ? note : n),
        }) as ProjectWithRelations)
      } else {
        // Remove temp note on failure
        onUpdate(prev => ({
          ...prev,
          notes: prev.notes.filter(n => n.id !== tempId),
        }) as ProjectWithRelations)
        showToast('Failed to create note')
      }
    } catch {
      onUpdate(prev => ({
        ...prev,
        notes: prev.notes.filter(n => n.id !== tempId),
      }) as ProjectWithRelations)
      showToast('Failed to create note: Network error')
    }
  }

  const updateNote = (note: Note, updates: Partial<Note>) => {
    // Optimistic update immediately
    const updatedNote = { ...note, ...updates, updated_at: new Date().toISOString() }
    onUpdate({
      ...project,
      notes: project.notes.map(n => n.id === note.id ? updatedNote : n),
    })

    // Don't sync temp notes (not yet saved to server)
    if (note.id.startsWith('temp-')) return

    // Debounced sync to server
    debouncedSync(note.id, 'note', updates)
  }

  const deleteNote = async (noteId: string) => {
    // For temp notes, just remove from UI
    if (noteId.startsWith('temp-')) {
      onUpdate({ ...project, notes: project.notes.filter(n => n.id !== noteId) })
      return
    }

    // Store for rollback
    const originalNotes = [...project.notes]

    // Optimistic delete immediately
    onUpdate({ ...project, notes: project.notes.filter(n => n.id !== noteId) })

    try {
      const res = await fetch(`/api/projects/${project.id}/notes?note_id=${noteId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        onUpdate({ ...project, notes: originalNotes })
        showToast('Failed to delete note')
      }
    } catch {
      onUpdate({ ...project, notes: originalNotes })
      showToast('Failed to delete note: Network error')
    }
  }

  const addCommand = async () => {
    // Optimistic: create temporary command immediately
    const tempId = `temp-${Date.now()}`
    const tempCmd: Command = {
      id: tempId,
      project_id: project.id,
      user_id: '',
      command: '',
      description: '',
      created_at: new Date().toISOString(),
    }
    onUpdate({ ...project, commands: [...project.commands, tempCmd] })

    try {
      const res = await fetch(`/api/projects/${project.id}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const cmd = await res.json()
        onUpdate(prev => ({
          ...prev,
          commands: prev.commands.map(c => c.id === tempId ? cmd : c),
        }) as ProjectWithRelations)
      } else {
        onUpdate(prev => ({
          ...prev,
          commands: prev.commands.filter(c => c.id !== tempId),
        }) as ProjectWithRelations)
        showToast('Failed to create command')
      }
    } catch {
      onUpdate(prev => ({
        ...prev,
        commands: prev.commands.filter(c => c.id !== tempId),
      }) as ProjectWithRelations)
      showToast('Failed to create command: Network error')
    }
  }

  const updateCommand = (cmd: Command, updates: Partial<Command>) => {
    // Optimistic update immediately
    const updatedCmd = { ...cmd, ...updates }
    onUpdate({
      ...project,
      commands: project.commands.map(c => c.id === cmd.id ? updatedCmd : c),
    })

    // Don't sync temp commands
    if (cmd.id.startsWith('temp-')) return

    // Debounced sync to server
    debouncedSync(cmd.id, 'command', updates)
  }

  const deleteCommand = async (cmdId: string) => {
    // For temp commands, just remove from UI
    if (cmdId.startsWith('temp-')) {
      onUpdate({ ...project, commands: project.commands.filter(c => c.id !== cmdId) })
      return
    }

    // Store for rollback
    const originalCommands = [...project.commands]

    // Optimistic delete immediately
    onUpdate({ ...project, commands: project.commands.filter(c => c.id !== cmdId) })

    try {
      const res = await fetch(`/api/projects/${project.id}/commands?command_id=${cmdId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        onUpdate({ ...project, commands: originalCommands })
        showToast('Failed to delete command')
      }
    } catch {
      onUpdate({ ...project, commands: originalCommands })
      showToast('Failed to delete command: Network error')
    }
  }

  const copyCommand = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const filteredNotes = project.notes.filter(note => {
    if (tagFilter && note.tag !== tagFilter) return false
    if (timeFilter && getTimePeriod(note.created_at) !== timeFilter) return false
    return true
  })

  return (
    <article className="bg-bg-secondary border border-border-light rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={toggleExpand}
      >
        <button className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-medium text-text-primary mb-1">
            {project.title}
          </h2>
          {project.description && (
            <p className="text-sm text-text-secondary mb-1">{project.description}</p>
          )}
          {project.authors.length > 0 && (
            <span className="text-xs text-text-muted">by {project.authors.join(', ')}</span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn"
              title="Open GitHub"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          )}
          {project.local_path && (
            <button onClick={openInVSCode} className="icon-btn text-[#007ACC]" title="Open in VSCode">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.583 2.168a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-1.52.31l-2.2-.99-5.424 4.943L14.83 18.5l2.2-.99a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-2.108-.31L15.37 22.5 8.46 16.5l-5.93 5.41a1.384 1.384 0 0 1-1.94-.13L.47 21.64a1.384 1.384 0 0 1 .12-1.96L6.52 14l-5.93-5.68a1.384 1.384 0 0 1-.12-1.96l.12-.14a1.384 1.384 0 0 1 1.94-.13l5.93 5.41 6.91-6-1.07-3.41a1.385 1.385 0 0 1 .31-1.52l2.97-2.71z"/>
              </svg>
            </button>
          )}
          <button onClick={() => onEdit(project)} className="icon-btn" title="Edit project">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${project.title}"?`)) {
                onDelete(project.id)
              }
            }}
            className="icon-btn"
            title="Delete project"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-light bg-bg-primary animate-slideDown">
          <div className="flex gap-0 border-b border-border-light px-4">
            <button
              className={`text-xs py-3 px-4 relative transition-colors ${
                activeTab === 'notes' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setActiveTab('notes')}
            >
              Notes
              {activeTab === 'notes' && (
                <span className="absolute bottom-[-1px] left-4 right-4 h-0.5 bg-accent-primary rounded-t" />
              )}
            </button>
            <button
              className={`text-xs py-3 px-4 relative transition-colors ${
                activeTab === 'commands' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setActiveTab('commands')}
            >
              Quick Commands
              {activeTab === 'commands' && (
                <span className="absolute bottom-[-1px] left-4 right-4 h-0.5 bg-accent-primary rounded-t" />
              )}
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'notes' && (
              <>
                <div className="flex gap-2 mb-3">
                  <select
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value as NoteTag | '')}
                    className="text-xs px-2 py-1.5 border border-border rounded bg-bg-secondary text-text-secondary"
                  >
                    <option value="">All Tags</option>
                    <option value="Note">Note</option>
                    <option value="Bug">Bug</option>
                    <option value="Feature">Feature</option>
                    <option value="Idea">Idea</option>
                  </select>
                  <select
                    value={timeFilter}
                    onChange={e => setTimeFilter(e.target.value)}
                    className="text-xs px-2 py-1.5 border border-border rounded bg-bg-secondary text-text-secondary"
                  >
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="older">Older</option>
                  </select>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="w-24 pb-2 px-2">Tag</th>
                      <th className="w-20 pb-2 px-2">Added</th>
                      <th className="pb-2 px-2">Content</th>
                      <th className="w-10 pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotes.map(note => (
                      <tr key={note.id} className="border-t border-border-light group">
                        <td className="py-2 px-2">
                          <select
                            value={note.tag}
                            onChange={e => updateNote(note, { tag: e.target.value as NoteTag })}
                            className={`tag cursor-pointer ${
                              note.tag === 'Note' ? 'tag-note' :
                              note.tag === 'Bug' ? 'tag-bug' :
                              note.tag === 'Feature' ? 'tag-feature' : 'tag-idea'
                            }`}
                          >
                            <option value="Note">Note</option>
                            <option value="Bug">Bug</option>
                            <option value="Feature">Feature</option>
                            <option value="Idea">Idea</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 text-xs text-text-muted font-mono whitespace-nowrap">
                          {formatDate(note.created_at)}
                        </td>
                        <td className="py-2 px-2">
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="outline-none px-1 -mx-1 rounded hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary"
                            onBlur={e => updateNote(note, { content: e.currentTarget.textContent || '' })}
                          >
                            {note.content}
                          </div>
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-accent-bug transition-opacity"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button onClick={addNote} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary mt-3 px-3 py-2 border border-dashed border-border rounded hover:border-accent-primary transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add note
                </button>
              </>
            )}

            {activeTab === 'commands' && (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="pb-2 px-2">Command</th>
                      <th className="pb-2 px-2">Description</th>
                      <th className="w-10 pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.commands.map(cmd => (
                      <tr key={cmd.id} className="border-t border-border-light group">
                        <td className="py-2 px-2">
                          <div className="relative">
                            <code
                              contentEditable
                              suppressContentEditableWarning
                              className="block font-mono text-xs bg-bg-tertiary px-2 py-1.5 pr-8 rounded outline-none focus:ring-2 focus:ring-accent-primary"
                              onBlur={e => updateCommand(cmd, { command: e.currentTarget.textContent || '' })}
                            >
                              {cmd.command}
                            </code>
                            <button
                              onClick={() => copyCommand(cmd.command || '')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-opacity"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 w-full">
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            className="outline-none px-1 -mx-1 rounded hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary"
                            onBlur={e => updateCommand(cmd, { description: e.currentTarget.textContent || '' })}
                          >
                            {cmd.description}
                          </div>
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => deleteCommand(cmd.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-accent-bug transition-opacity"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button onClick={addCommand} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary mt-3 px-3 py-2 border border-dashed border-border rounded hover:border-accent-primary transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add command
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
