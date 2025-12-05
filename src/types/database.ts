export type NoteTag = 'Note' | 'Bug' | 'Feature' | 'Idea'
export type PathType = 'wsl' | 'windows'

export interface Profile {
  id: string
  theme: 'light' | 'dark'
  default_distro: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  description: string | null
  authors: string[]
  github_url: string | null
  local_path: string | null
  path_type: PathType
  wsl_distro: string
  is_expanded: boolean
  created_at: string
  updated_at: string
}

export interface Note {
  id: string
  project_id: string
  user_id: string
  tag: NoteTag
  content: string | null
  created_at: string
  updated_at: string
}

export interface Command {
  id: string
  project_id: string
  user_id: string
  command: string | null
  description: string | null
  created_at: string
}

export interface ProjectWithRelations extends Project {
  notes: Note[]
  commands: Command[]
}

// For localStorage migration
export interface LegacyProject {
  id: string
  title: string
  description: string
  authors: string[]
  githubUrl: string | null
  localPath: string
  pathType: 'wsl' | 'windows'
  wslDistro: string
  isExpanded: boolean
  createdAt: number
  updatedAt: number
  notes: {
    id: string
    tag: NoteTag
    content: string
    createdAt: number
    updatedAt: number
  }[]
  commands: {
    id: string
    command: string
    description: string
    createdAt: number
  }[]
}

export interface LegacyData {
  projects: LegacyProject[]
  settings: {
    theme: 'light' | 'dark'
    defaultDistro: string
  }
}
