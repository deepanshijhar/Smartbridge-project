CREATE TABLE public.class_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  class_name text NOT NULL DEFAULT 'Untitled class',
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_sec integer NOT NULL DEFAULT 0,
  avg_engagement numeric NOT NULL DEFAULT 0,
  peak_students integer NOT NULL DEFAULT 0,
  avg_noise_db numeric,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_sessions TO authenticated;
GRANT ALL ON public.class_sessions TO service_role;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.class_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.class_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.class_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);