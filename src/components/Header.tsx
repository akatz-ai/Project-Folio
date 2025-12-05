'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useTheme } from './Providers'

interface HeaderProps {
  onAddProject?: () => void
}

export function Header({ onAddProject }: HeaderProps) {
  const { data: session } = useSession()
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border-light bg-bg-primary sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-2xl font-medium text-text-primary tracking-tight">
          Project Folio
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="icon-btn"
          title="Toggle theme"
        >
          {theme === 'light' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="5"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {session ? (
          <>
            <button onClick={onAddProject} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>New Project</span>
            </button>
            <button
              onClick={() => signOut()}
              className="icon-btn"
              title="Sign out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </>
        ) : (
          <button onClick={() => signIn('google')} className="btn btn-primary">
            Sign in with Google
          </button>
        )}
      </div>
    </header>
  )
}
