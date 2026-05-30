
-- Scripts table for Prompter
CREATE TABLE public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled script',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scripts TO authenticated;
GRANT ALL ON public.scripts TO service_role;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scripts_select_own" ON public.scripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "scripts_insert_own" ON public.scripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "scripts_update_own" ON public.scripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "scripts_delete_own" ON public.scripts FOR DELETE USING (auth.uid() = user_id);

-- Studio projects table
CREATE TABLE public.studio_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled project',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_projects TO authenticated;
GRANT ALL ON public.studio_projects TO service_role;
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "studio_select_own" ON public.studio_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "studio_insert_own" ON public.studio_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "studio_update_own" ON public.studio_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "studio_delete_own" ON public.studio_projects FOR DELETE USING (auth.uid() = user_id);

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER scripts_touch BEFORE UPDATE ON public.scripts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER studio_touch BEFORE UPDATE ON public.studio_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Private storage bucket for media (per-user folder = first path segment)
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "media_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "media_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "media_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "media_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
