'use client'

import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { ProjectWithRelations, Note, Command, Link, NoteTag, LinkType } from '@/types/database'
import { useToast } from './Toast'
import { LinkEditModal } from './LinkEditModal'

// Isolated textarea that manages its own state - parent re-renders won't affect it
const IsolatedTextarea = memo(function IsolatedTextarea({
  initialValue,
  placeholder,
  className,
  onSave,
}: {
  initialValue: string
  placeholder: string
  className: string
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea to fit content
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [value])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      placeholder={placeholder}
      className={className}
      rows={1}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  )
})

// Isolated input for commands with auto-resize behavior
const IsolatedCommandInput = memo(function IsolatedCommandInput({
  initialValue,
  placeholder,
  className,
  onSave,
}: {
  initialValue: string
  placeholder: string
  className: string
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize: single line up to max width, then wrap
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset to measure natural size
      textarea.style.height = 'auto'
      textarea.style.width = 'auto'

      const naturalWidth = textarea.scrollWidth
      const minWidth = 120
      const maxWidth = 400

      if (naturalWidth <= maxWidth) {
        textarea.style.width = `${Math.max(naturalWidth, minWidth)}px`
      } else {
        textarea.style.width = `${maxWidth}px`
      }

      // Now set height based on content
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [value])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      placeholder={placeholder}
      className={className}
      rows={1}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  )
})

// Simple isolated input for descriptions
const IsolatedInput = memo(function IsolatedInput({
  initialValue,
  placeholder,
  className,
  onSave,
}: {
  initialValue: string
  placeholder: string
  className: string
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onSave(value)}
    />
  )
})

interface ProjectCardProps {
  project: ProjectWithRelations
  onUpdate: (projectOrFn: ProjectWithRelations | ((prev: ProjectWithRelations) => ProjectWithRelations)) => void
  onDelete: (id: string) => void
  onEdit: (project: ProjectWithRelations) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, id: string) => void
  isDragging?: boolean
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

export function ProjectCard({ project, onUpdate, onDelete, onEdit, onDragStart, onDragOver, onDrop, isDragging }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(project.is_expanded)
  const [activeTab, setActiveTab] = useState<'notes' | 'commands' | 'links'>('notes')
  const [tagFilter, setTagFilter] = useState<NoteTag | ''>('')
  const [timeFilter, setTimeFilter] = useState('')
  const [editingLink, setEditingLink] = useState<Link | null>(null)
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

  // Flush pending updates on page unload to prevent data loss
  useEffect(() => {
    const flushPendingUpdates = () => {
      // First, blur the active element to trigger onBlur handlers on any focused inputs
      // This ensures typed content gets added to pendingUpdates before we flush
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }

      // Clear all debounce timers
      Object.values(debounceTimers.current).forEach(timer => clearTimeout(timer))
      debounceTimers.current = {}

      // Send all pending updates via sendBeacon (works during page unload)
      Object.entries(pendingUpdates.current).forEach(([key, pending]) => {
        // Key format is 'type-uuid', split only on first dash to preserve UUID
        const firstDash = key.indexOf('-')
        const type = key.slice(0, firstDash) as 'note' | 'command'
        const id = key.slice(firstDash + 1)

        const endpoint = type === 'note'
          ? `/api/projects/${project.id}/notes`
          : `/api/projects/${project.id}/commands`

        const body = type === 'note'
          ? { note_id: id, ...pending.updates }
          : { command_id: id, ...pending.updates }

        // sendBeacon queues the request to complete even after page unloads
        // Use Blob with correct content-type since sendBeacon defaults to text/plain
        const blob = new Blob([JSON.stringify(body)], { type: 'application/json' })
        navigator.sendBeacon(endpoint, blob)
      })
      pendingUpdates.current = {}
    }

    window.addEventListener('beforeunload', flushPendingUpdates)
    return () => window.removeEventListener('beforeunload', flushPendingUpdates)
  }, [project.id])

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
      uri = `vscode://vscode-remote/wsl+${project.wsl_distro}${project.local_path}?windowId=_blank`
    } else {
      uri = `vscode://file/${project.local_path?.replace(/\\/g, '/')}?windowId=_blank`
    }
    window.open(uri, '_blank')
  }

  const addNote = () => {
    // Generate real UUID client-side - no server round-trip needed for UI
    const id = crypto.randomUUID()
    const newNote: Note = {
      id,
      project_id: project.id,
      user_id: '',
      tag: 'Note',
      content: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    onUpdate({ ...project, notes: [...project.notes, newNote] })

    // Fire and forget - sync to server in background, don't update UI on response
    fetch(`/api/projects/${project.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tag: 'Note', content: '' }),
    }).catch(() => showToast('Failed to sync note to server'))
  }

  const updateNote = (note: Note, updates: Partial<Note>) => {
    // Optimistic update immediately
    const updatedNote = { ...note, ...updates, updated_at: new Date().toISOString() }
    onUpdate({
      ...project,
      notes: project.notes.map(n => n.id === note.id ? updatedNote : n),
    })

    // Debounced sync to server
    debouncedSync(note.id, 'note', updates)
  }

  const deleteNote = (noteId: string) => {
    // Update UI immediately
    onUpdate({ ...project, notes: project.notes.filter(n => n.id !== noteId) })

    // Fire and forget - sync to server in background
    fetch(`/api/projects/${project.id}/notes?note_id=${noteId}`, {
      method: 'DELETE',
    }).catch(() => showToast('Failed to sync delete to server'))
  }

  const addCommand = () => {
    // Generate real UUID client-side - no server round-trip needed for UI
    const id = crypto.randomUUID()
    const newCmd: Command = {
      id,
      project_id: project.id,
      user_id: '',
      command: '',
      description: '',
      created_at: new Date().toISOString(),
    }
    onUpdate({ ...project, commands: [...project.commands, newCmd] })

    // Fire and forget - sync to server in background
    fetch(`/api/projects/${project.id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, command: '', description: '' }),
    }).catch(() => showToast('Failed to sync command to server'))
  }

  const updateCommand = (cmd: Command, updates: Partial<Command>) => {
    // Optimistic update immediately
    const updatedCmd = { ...cmd, ...updates }
    onUpdate({
      ...project,
      commands: project.commands.map(c => c.id === cmd.id ? updatedCmd : c),
    })

    // Debounced sync to server
    debouncedSync(cmd.id, 'command', updates)
  }

  const deleteCommand = (cmdId: string) => {
    // Update UI immediately
    onUpdate({ ...project, commands: project.commands.filter(c => c.id !== cmdId) })

    // Fire and forget - sync to server in background
    fetch(`/api/projects/${project.id}/commands?command_id=${cmdId}`, {
      method: 'DELETE',
    }).catch(() => showToast('Failed to sync delete to server'))
  }

  const copyCommand = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const openLink = (link: Link) => {
    if (link.link_type === 'url' && link.url) {
      window.open(link.url, '_blank')
    } else if (link.link_type === 'vscode' && link.path) {
      let uri = ''
      if (link.path_type === 'wsl') {
        uri = `vscode://vscode-remote/wsl+${link.wsl_distro}${link.path}?windowId=_blank`
      } else {
        uri = `vscode://file/${link.path.replace(/\\/g, '/')}?windowId=_blank`
      }
      window.open(uri, '_blank')
    } else if (link.link_type === 'directory' && link.path) {
      // Browsers block file:// URLs, so copy path for user to paste in Explorer
      let pathToCopy = link.path
      if (link.path_type === 'wsl') {
        pathToCopy = `\\\\wsl$\\${link.wsl_distro}${link.path.replace(/\//g, '\\')}`
      }
      navigator.clipboard.writeText(pathToCopy)
      showToast('Path copied - paste in Explorer address bar', 'success')
    }
  }

  const addLink = () => {
    const id = crypto.randomUUID()
    const newLink: Link = {
      id,
      project_id: project.id,
      user_id: '',
      name: 'New Link',
      description: '',
      link_type: 'url',
      url: '',
      path: null,
      path_type: 'wsl',
      wsl_distro: 'Ubuntu',
      created_at: new Date().toISOString(),
    }
    onUpdate({ ...project, links: [...(project.links || []), newLink] })

    fetch(`/api/projects/${project.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'New Link', link_type: 'url' }),
    }).catch(() => showToast('Failed to sync link to server'))

    setEditingLink(newLink)
  }

  const updateLink = (link: Link, updates: Partial<Link>) => {
    const updatedLink = { ...link, ...updates }
    onUpdate({
      ...project,
      links: (project.links || []).map(l => l.id === link.id ? updatedLink : l),
    })

    fetch(`/api/projects/${project.id}/links`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: link.id, ...updates }),
    }).catch(() => showToast('Failed to sync link to server'))
  }

  const deleteLink = (linkId: string) => {
    onUpdate({ ...project, links: (project.links || []).filter(l => l.id !== linkId) })

    fetch(`/api/projects/${project.id}/links?link_id=${linkId}`, {
      method: 'DELETE',
    }).catch(() => showToast('Failed to sync delete to server'))
  }

  const filteredNotes = project.notes.filter(note => {
    if (tagFilter && note.tag !== tagFilter) return false
    if (timeFilter && getTimePeriod(note.created_at) !== timeFilter) return false
    return true
  })

  return (
    <article
      className={`bg-bg-secondary border border-border-light rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow ${isDragging ? 'opacity-50' : ''}`}
      onDragOver={onDragOver}
      onDrop={e => onDrop(e, project.id)}
    >
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
          <div
            draggable
            onDragStart={e => onDragStart(e, project.id)}
            className="icon-btn cursor-grab active:cursor-grabbing ml-1"
            title="Drag to reorder"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="5" r="2"/>
              <circle cx="12" cy="5" r="2"/>
              <circle cx="19" cy="5" r="2"/>
              <circle cx="5" cy="12" r="2"/>
              <circle cx="12" cy="12" r="2"/>
              <circle cx="19" cy="12" r="2"/>
              <circle cx="5" cy="19" r="2"/>
              <circle cx="12" cy="19" r="2"/>
              <circle cx="19" cy="19" r="2"/>
            </svg>
          </div>
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
            <button
              className={`text-xs py-3 px-4 relative transition-colors ${
                activeTab === 'links' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              onClick={() => setActiveTab('links')}
            >
              Links
              {activeTab === 'links' && (
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

                {/* Desktop table layout */}
                <table className="hidden sm:table w-full text-sm">
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
                          <IsolatedTextarea
                            key={note.id}
                            initialValue={note.content || ''}
                            placeholder="Add a note..."
                            className="w-full outline-none px-2 py-1 rounded border border-border-light bg-transparent hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary"
                            onSave={value => updateNote(note, { content: value })}
                          />
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

                {/* Mobile card layout */}
                <div className="sm:hidden space-y-3">
                  {filteredNotes.map(note => (
                    <div key={note.id} className="border border-border-light rounded-lg p-3 group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
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
                          <span className="text-xs text-text-muted font-mono">
                            {formatDate(note.created_at)}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="p-1 text-text-muted hover:text-accent-bug transition-opacity"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      <IsolatedTextarea
                        key={note.id}
                        initialValue={note.content || ''}
                        placeholder="Add a note..."
                        className="w-full outline-none px-2 py-1 rounded border border-border-light bg-transparent hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary text-sm"
                        onSave={value => updateNote(note, { content: value })}
                      />
                    </div>
                  ))}
                </div>

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
                {/* Desktop table layout */}
                <table className="hidden sm:table w-full text-sm">
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
                        <td className="py-2 px-2 align-top">
                          <div className="relative inline-block align-top">
                            <IsolatedCommandInput
                              key={cmd.id}
                              initialValue={cmd.command || ''}
                              placeholder="npm run dev"
                              className="font-mono text-xs bg-bg-tertiary px-2 py-1.5 pr-8 rounded outline-none focus:ring-2 focus:ring-accent-primary"
                              onSave={value => updateCommand(cmd, { command: value })}
                            />
                            <button
                              onClick={() => copyCommand(cmd.command || '')}
                              className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-opacity"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 w-full">
                          <IsolatedInput
                            key={`${cmd.id}-desc`}
                            initialValue={cmd.description || ''}
                            placeholder="Add description..."
                            className="w-full outline-none px-2 py-1 rounded border border-border-light bg-transparent hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary"
                            onSave={value => updateCommand(cmd, { description: value })}
                          />
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

                {/* Mobile card layout */}
                <div className="sm:hidden space-y-3">
                  {project.commands.map(cmd => (
                    <div key={cmd.id} className="border border-border-light rounded-lg p-3 group">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="relative flex-1 min-w-0">
                          <IsolatedCommandInput
                            key={cmd.id}
                            initialValue={cmd.command || ''}
                            placeholder="npm run dev"
                            className="font-mono text-xs bg-bg-tertiary px-2 py-1.5 pr-8 rounded outline-none focus:ring-2 focus:ring-accent-primary w-full"
                            onSave={value => updateCommand(cmd, { command: value })}
                          />
                          <button
                            onClick={() => copyCommand(cmd.command || '')}
                            className="absolute right-1 top-1 p-1 text-text-muted hover:text-text-primary transition-opacity"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          </button>
                        </div>
                        <button
                          onClick={() => deleteCommand(cmd.id)}
                          className="p-1 text-text-muted hover:text-accent-bug transition-opacity flex-shrink-0"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      <IsolatedTextarea
                        key={`${cmd.id}-desc`}
                        initialValue={cmd.description || ''}
                        placeholder="Add description..."
                        className="w-full outline-none px-2 py-1 rounded border border-border-light bg-transparent hover:bg-bg-secondary focus:bg-bg-secondary focus:ring-2 focus:ring-accent-primary text-sm"
                        onSave={value => updateCommand(cmd, { description: value })}
                      />
                    </div>
                  ))}
                </div>

                <button onClick={addCommand} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary mt-3 px-3 py-2 border border-dashed border-border rounded hover:border-accent-primary transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add command
                </button>
              </>
            )}

            {activeTab === 'links' && (
              <>
                {/* Desktop layout */}
                <div className="hidden sm:block space-y-2">
                  {(project.links || []).map(link => (
                    <div key={link.id} className="flex items-center gap-3 p-2 rounded border border-border-light group">
                      <button
                        onClick={() => openLink(link)}
                        className="px-3 py-1.5 bg-accent-primary text-white text-sm rounded hover:opacity-90 transition-opacity flex items-center gap-2 flex-shrink-0"
                      >
                        {link.link_type === 'vscode' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.583 2.168a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-1.52.31l-2.2-.99-5.424 4.943L14.83 18.5l2.2-.99a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-2.108-.31L15.37 22.5 8.46 16.5l-5.93 5.41a1.384 1.384 0 0 1-1.94-.13L.47 21.64a1.384 1.384 0 0 1 .12-1.96L6.52 14l-5.93-5.68a1.384 1.384 0 0 1-.12-1.96l.12-.14a1.384 1.384 0 0 1 1.94-.13l5.93 5.41 6.91-6-1.07-3.41a1.385 1.385 0 0 1 .31-1.52l2.97-2.71z"/>
                          </svg>
                        )}
                        {link.link_type === 'directory' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        )}
                        {link.link_type === 'url' && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
                        )}
                        {link.name}
                      </button>

                      <span className="flex-1 text-sm text-text-secondary truncate">
                        {link.description || 'No description'}
                      </span>

                      <button
                        onClick={() => setEditingLink(link)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-text-primary transition-opacity"
                        title="Edit link"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>

                      <button
                        onClick={() => deleteLink(link.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-accent-bug transition-opacity"
                        title="Delete link"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Mobile layout */}
                <div className="sm:hidden space-y-3">
                  {(project.links || []).map(link => (
                    <div key={link.id} className="border border-border-light rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => openLink(link)}
                          className="px-3 py-1.5 bg-accent-primary text-white text-sm rounded hover:opacity-90 flex items-center gap-2"
                        >
                          {link.link_type === 'vscode' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.583 2.168a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-1.52.31l-2.2-.99-5.424 4.943L14.83 18.5l2.2-.99a1.384 1.384 0 0 1 1.52.31l3.494 3.18a1.385 1.385 0 0 1 0 2.04l-3.494 3.18a1.384 1.384 0 0 1-2.108-.31L15.37 22.5 8.46 16.5l-5.93 5.41a1.384 1.384 0 0 1-1.94-.13L.47 21.64a1.384 1.384 0 0 1 .12-1.96L6.52 14l-5.93-5.68a1.384 1.384 0 0 1-.12-1.96l.12-.14a1.384 1.384 0 0 1 1.94-.13l5.93 5.41 6.91-6-1.07-3.41a1.385 1.385 0 0 1 .31-1.52l2.97-2.71z"/>
                            </svg>
                          )}
                          {link.link_type === 'directory' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                          )}
                          {link.link_type === 'url' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                            </svg>
                          )}
                          {link.name}
                        </button>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingLink(link)} className="p-1 text-text-muted">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button onClick={() => deleteLink(link.id)} className="p-1 text-text-muted">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary">{link.description || 'No description'}</p>
                    </div>
                  ))}
                </div>

                <button onClick={addLink} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary mt-3 px-3 py-2 border border-dashed border-border rounded hover:border-accent-primary transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add link
                </button>

                {editingLink && (
                  <LinkEditModal
                    link={editingLink}
                    onSave={(updates) => updateLink(editingLink, updates)}
                    onClose={() => setEditingLink(null)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
