'use client'

import { useState, useEffect } from 'react'
import { ProjectWithRelations, PathType } from '@/types/database'

interface ProjectModalProps {
  project?: ProjectWithRelations | null
  onSave: (data: {
    title: string
    description: string
    authors: string[]
    github_url: string | null
    local_path: string | null
    path_type: PathType
    wsl_distro: string
  }) => void
  onClose: () => void
}

export function ProjectModal({ project, onSave, onClose }: ProjectModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authors, setAuthors] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [pathType, setPathType] = useState<PathType>('wsl')
  const [wslDistro, setWslDistro] = useState('Ubuntu')

  useEffect(() => {
    if (project) {
      setTitle(project.title)
      setDescription(project.description || '')
      setAuthors(project.authors.join(', '))
      setGithubUrl(project.github_url || '')
      setLocalPath(project.local_path || '')
      setPathType(project.path_type)
      setWslDistro(project.wsl_distro)
    }
  }, [project])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title,
      description,
      authors: authors.split(',').map(a => a.trim()).filter(Boolean),
      github_url: githubUrl || null,
      local_path: localPath || null,
      path_type: pathType,
      wsl_distro: wslDistro,
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-lg shadow-lg p-6 w-full max-w-md mx-4 animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-medium mb-5">
          {project ? 'Edit Project' : 'New Project'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="form-input"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="form-input resize-y min-h-[60px]"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Authors (comma-separated)
              </label>
              <input
                type="text"
                value={authors}
                onChange={e => setAuthors(e.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                GitHub URL
              </label>
              <input
                type="url"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                className="form-input"
                placeholder="https://github.com/user/repo"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Local Path
                </label>
                <input
                  type="text"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  className="form-input"
                  placeholder="/home/user/projects/my-project"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Type
                </label>
                <select
                  value={pathType}
                  onChange={e => setPathType(e.target.value as PathType)}
                  className="form-input"
                >
                  <option value="wsl">WSL</option>
                  <option value="windows">Windows</option>
                </select>
              </div>
            </div>

            {pathType === 'wsl' && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  WSL Distro
                </label>
                <input
                  type="text"
                  value={wslDistro}
                  onChange={e => setWslDistro(e.target.value)}
                  className="form-input"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-light">
            <button type="button" onClick={onClose} className="btn">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
