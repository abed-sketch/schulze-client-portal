-- Applied to zwtmlrzwqnluosrdbjfv as restrict_portal_snapshot_execution.
-- Only the backend service role may replace the complete portal read model.
REVOKE ALL ON FUNCTION public.portal_replace_snapshot(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_replace_snapshot(jsonb, jsonb) TO service_role;
