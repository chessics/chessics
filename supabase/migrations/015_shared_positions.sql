BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_positions (
  id TEXT PRIMARY KEY,
  position_id UUID NOT NULL REFERENCES public.training_positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CONSTRAINT shared_positions_slug_shape CHECK (id ~ '^[A-Za-z0-9]{8}$'),
  CONSTRAINT shared_positions_one_per_position UNIQUE (user_id, position_id),
  CONSTRAINT shared_positions_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

ALTER TABLE public.shared_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own shared positions" ON public.shared_positions;
CREATE POLICY "Owners can view own shared positions" ON public.shared_positions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can share own answered positions" ON public.shared_positions;
CREATE POLICY "Owners can share own answered positions" ON public.shared_positions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.training_positions tp
      JOIN public.games g ON g.id = tp.game_id
      WHERE tp.id = shared_positions.position_id AND g.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.position_id = shared_positions.position_id AND i.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Owners can revoke own shared positions" ON public.shared_positions;
CREATE POLICY "Owners can revoke own shared positions" ON public.shared_positions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND revoked_at IS NOT NULL);

REVOKE ALL ON TABLE public.shared_positions FROM PUBLIC;
REVOKE ALL ON TABLE public.shared_positions FROM anon, authenticated;
GRANT SELECT ON TABLE public.shared_positions TO authenticated;
GRANT INSERT (id, position_id, user_id) ON TABLE public.shared_positions TO authenticated;
GRANT UPDATE (revoked_at) ON TABLE public.shared_positions TO authenticated;
GRANT SELECT ON TABLE public.shared_positions TO service_role;

COMMIT;
