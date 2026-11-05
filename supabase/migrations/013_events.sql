BEGIN;

CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID NULL,
  guest_key TEXT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_name_shape CHECK (name ~ '^[a-z][a-z_]{0,63}$'),
  CONSTRAINT events_guest_key_shape CHECK (guest_key IS NULL OR guest_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT events_props_object CHECK (jsonb_typeof(props) = 'object'),
  CONSTRAINT events_props_keys CHECK ((props - 'platform' - 'game_count' - 'time_class') = '{}'::jsonb),
  CONSTRAINT events_props_platform CHECK (
    NOT (props ? 'platform') OR (props->>'platform') IN ('chess_com', 'lichess')
  ),
  CONSTRAINT events_props_time_class CHECK (
    NOT (props ? 'time_class')
    OR (props->>'time_class') IN ('rapid_blitz', 'all', 'bullet', 'blitz', 'rapid', 'classical', 'daily')
  ),
  CONSTRAINT events_props_game_count CHECK (
    NOT (props ? 'game_count')
    OR (
      jsonb_typeof(props->'game_count') = 'number'
      AND (props->>'game_count') ~ '^[0-9]{1,4}$'
      AND (props->>'game_count')::int <= 1000
    )
  )
);

CREATE INDEX IF NOT EXISTS events_name_created_at ON public.events (name, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS events_one_signup_per_user
  ON public.events (user_id) WHERE name = 'signup' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_one_report_view_per_guest
  ON public.events (guest_key) WHERE name = 'report_viewed' AND guest_key IS NOT NULL;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.events FROM PUBLIC;
REVOKE ALL ON TABLE public.events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.events TO service_role;

COMMIT;
