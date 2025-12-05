-- Project Folio Database Schema
-- Run this in your Supabase SQL Editor

-- User profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'dark',
  default_distro TEXT DEFAULT 'Ubuntu',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  authors TEXT[] DEFAULT '{}',
  github_url TEXT,
  local_path TEXT,
  path_type TEXT DEFAULT 'wsl',
  wsl_distro TEXT DEFAULT 'Ubuntu',
  is_expanded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag TEXT DEFAULT 'Note' CHECK (tag IN ('Note', 'Bug', 'Feature', 'Idea')),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commands
CREATE TABLE commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  command TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX projects_user_id_idx ON projects(user_id);
CREATE INDEX notes_project_id_idx ON notes(project_id);
CREATE INDEX commands_project_id_idx ON commands(project_id);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;

-- Profiles: users see only their own
CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- Projects: users see only their own
CREATE POLICY "Users manage own projects" ON projects
  FOR ALL USING (user_id = auth.uid());

-- Notes: users see only their own
CREATE POLICY "Users manage own notes" ON notes
  FOR ALL USING (user_id = auth.uid());

-- Commands: users see only their own
CREATE POLICY "Users manage own commands" ON commands
  FOR ALL USING (user_id = auth.uid());

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
