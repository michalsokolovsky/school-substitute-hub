-- The guard trigger from 20261011000000 failed for the service role with
-- "permission denied for schema private", because it runs with the caller's rights and the service
-- role has no USAGE on schema private. Run it with the owner's rights instead, like private.has_role.
CREATE OR REPLACE FUNCTION private.guard_absence_lesson_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.admin_note := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
    RAISE EXCEPTION 'only an admin can decide on a lesson';
  END IF;
  RETURN NEW;
END;
$$;
