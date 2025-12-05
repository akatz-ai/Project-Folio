'use client'

import { useState, useEffect } from 'react'
import { Link, LinkType, PathType } from '@/types/database'

interface LinkEditModalProps {
  link: Link
  onSave: (updates: Partial<Link>) => void
  onClose: () => void
}

export function LinkEditModal({ link, onSave, onClose }: LinkEditModalProps) {
  const [name, setName] = useState(link.name)
  const [description, setDescription] = useState(link.description || '')
  const [linkType, setLinkType] = useState<LinkType>(link.link_type)
  const [url, setUrl] = useState(link.url || '')
  const [path, setPath] = useState(link.path || '')
  const [pathType, setPathType] = useState<PathType>(link.path_type)
  const [wslDistro, setWslDistro] = useState(link.wsl_distro)

  const handleSave = () => {
    onSave({
      name,
      description,
      link_type: linkType,
      url: linkType === 'url' ? url : null,
      path: linkType !== 'url' ? path : null,
      path_type: pathType,
      wsl_distro: wslDistro,
    })
    onClose()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div className="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-md mx-4" onMouseDown={e => e.stopPropagation()}>
        <h3 className="text-lg font-medium mb-4">Edit Link</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Button Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
              placeholder="My Project"
            />
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
              placeholder="Link to project for watching logs"
            />
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Link Type</label>
            <select
              value={linkType}
              onChange={e => setLinkType(e.target.value as LinkType)}
              className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
            >
              <option value="url">URL (Browser)</option>
              <option value="vscode">VS Code</option>
              <option value="directory">Copy Path</option>
            </select>
          </div>

          {linkType === 'url' && (
            <div>
              <label className="block text-sm text-text-muted mb-1">URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
                placeholder="https://example.com"
              />
            </div>
          )}

          {linkType !== 'url' && (
            <>
              <div>
                <label className="block text-sm text-text-muted mb-1">Path Type</label>
                <select
                  value={pathType}
                  onChange={e => setPathType(e.target.value as PathType)}
                  className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
                >
                  <option value="wsl">WSL</option>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                </select>
              </div>

              {pathType === 'wsl' && (
                <div>
                  <label className="block text-sm text-text-muted mb-1">WSL Distro</label>
                  <input
                    type="text"
                    value={wslDistro}
                    onChange={e => setWslDistro(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
                    placeholder="Ubuntu"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-text-muted mb-1">
                  Path {pathType === 'windows' ? '(e.g., C:\\Users\\user\\project)' : '(e.g., /home/user/project)'}
                </label>
                <input
                  type="text"
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-bg-primary focus:ring-2 focus:ring-accent-primary outline-none"
                  placeholder={pathType === 'windows' ? 'C:\\Users\\user\\project' : '/home/user/project'}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded hover:bg-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-accent-primary text-white rounded hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
