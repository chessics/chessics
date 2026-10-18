GRANT SELECT ON TABLE public.training_positions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.interactions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_positions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.interactions TO service_role;
