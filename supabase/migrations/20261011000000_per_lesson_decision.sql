-- Per-lesson decisions: the admin can approve or reject each lesson of an absence request on its
-- own, and a rejection carries its own reason. The request-level status stays as the overall
-- result (approved if at least one lesson was approved, rejected if all were rejected).
ALTER TABLE public.absence_lessons
  ADD COLUMN IF NOT EXISTS status public.absence_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_note text;

-- Existing requests that were already decided: copy the decision down to their lessons.
UPDATE public.absence_lessons al
SET status = ar.status,
    admin_note = CASE WHEN ar.status = 'rejected' THEN ar.admin_note ELSE NULL END
FROM public.absence_requests ar
WHERE ar.id = al.absence_request_id
  AND ar.status <> 'pending'
  AND al.status = 'pending';

-- The teacher's policy on absence_lessons lets her write any column of her own lessons, so without
-- a guard she could mark her own lesson as approved. Only an admin (or the service role, whose
-- auth.uid() is null) may set or change the decision columns.
CREATE OR REPLACE FUNCTION private.guard_absence_lesson_decision()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS absence_lessons_guard_decision ON public.absence_lessons;
CREATE TRIGGER absence_lessons_guard_decision
  BEFORE INSERT OR UPDATE ON public.absence_lessons
  FOR EACH ROW EXECUTE FUNCTION private.guard_absence_lesson_decision();
