'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectModal } from '@/components/ProjectModal'
import { AIChatSidebar } from '@/components/AIChatSidebar'
import { ProjectWithRelations, PathType } from '@/types/database'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithRelations | null>(null)
  const [showMigration, setShowMigration] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchProjects()
      checkMigration()
    }
  }, [session])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const checkMigration = () => {
    const legacy = localStorage.getItem('project-folio-data')
    if (legacy) {
      try {
        const data = JSON.parse(legacy)
        if (data.projects?.length > 0) {
          setShowMigration(true)
        }
      } catch {}
    }
  }

  const handleMigrate = async () => {
    const legacy = localStorage.getItem('project-folio-data')
    if (!legacy) return

    try {
      const data = JSON.parse(legacy)
      for (const p of data.projects) {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: p.title,
            description: p.description,
            authors: p.authors,
            github_url: p.githubUrl,
            local_path: p.localPath,
            path_type: p.pathType,
            wsl_distro: p.wslDistro,
          }),
        })

        if (res.ok) {
          const newProject = await res.json()

          // Migrate notes
          for (const note of p.notes || []) {
            await fetch(`/api/projects/${newProject.id}/notes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tag: note.tag, content: note.content }),
            })
          }

          // Migrate commands
          for (const cmd of p.commands || []) {
            await fetch(`/api/projects/${newProject.id}/commands`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd.command, description: cmd.description }),
            })
          }
        }
      }

      localStorage.removeItem('project-folio-data')
      setShowMigration(false)
      fetchProjects()
    } catch (err) {
      console.error('Migration failed:', err)
    }
  }

  const handleSaveProject = async (data: {
    title: string
    description: string
    authors: string[]
    github_url: string | null
    local_path: string | null
    path_type: PathType
    wsl_distro: string
  }) => {
    if (editingProject) {
      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setProjects(projects.map(p => p.id === editingProject.id ? updated : p))
      }
    } else {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const newProject = await res.json()
        setProjects([newProject, ...projects])
      }
    }
    setModalOpen(false)
    setEditingProject(null)
  }

  const handleDeleteProject = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setProjects(projects.filter(p => p.id !== id))
    }
  }

  const handleUpdateProject = (updated: ProjectWithRelations) => {
    setProjects(projects.map(p => p.id === updated.id ? updated : p))
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-text-muted">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header onAddProject={() => {
        setEditingProject(null)
        setModalOpen(true)
      }} />

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        {/* Migration banner */}
        {showMigration && (
          <div className="mb-6 p-4 bg-accent-feature/20 border border-accent-feature rounded-lg flex items-center justify-between">
            <p className="text-sm text-text-primary">
              We found existing project data. Would you like to import it?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowMigration(false)} className="btn text-sm">
                Skip
              </button>
              <button onClick={handleMigrate} className="btn btn-primary text-sm">
                Import Data
              </button>
            </div>
          </div>
        )}

        {/* Projects list */}
        <div className="flex flex-col gap-4">
          {projects.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              No projects yet. Create one to get started.
            </div>
          ) : (
            projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onUpdate={handleUpdateProject}
                onDelete={handleDeleteProject}
                onEdit={p => {
                  setEditingProject(p)
                  setModalOpen(true)
                }}
              />
            ))
          )}
        </div>
      </main>

      {/* Project Modal */}
      {modalOpen && (
        <ProjectModal
          project={editingProject}
          onSave={handleSaveProject}
          onClose={() => {
            setModalOpen(false)
            setEditingProject(null)
          }}
        />
      )}

      {/* AI Chat Sidebar */}
      <AIChatSidebar
        projects={projects}
        onProjectsUpdate={setProjects}
      />
    </div>
  )
}
