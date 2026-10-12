-- Two database-level guards for rules that were only enforced in the app.

-- 1. A teacher must not be able to reopen her own locked schedule.
-- The "self update teacher" policy lets a teacher update any column of her own row, including
-- schedule_locked, so she could unlock herself through the API. Locking is still allowed (the
-- final save locks the schedule); only an admin (or the service role) may go from locked to open.
CREATE OR REPLACE FUNCTION private.guard_teacher_schedule_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF OLD.schedule_locked AND NOT NEW.schedule_locked THEN
    RAISE EXCEPTION 'only an admin can unlock a schedule';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teachers_guard_schedule_lock ON public.teachers;
CREATE TRIGGER teachers_guard_schedule_lock
  BEFORE UPDATE OF schedule_locked ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION private.guard_teacher_schedule_lock();

-- 2. The same lesson cannot be requested twice for the same teacher and date.
-- Until now this was only checked in the app, so two requests sent at the same moment (or a
-- direct API call) could both get through. A lesson that was rejected frees its slot again.
-- A unique index cannot look across tables, so each lesson keeps a copy of its request's
-- teacher and date, filled in automatically.
ALTER TABLE public.absence_lessons
  ADD COLUMN IF NOT EXISTS teacher_id uuid,
  ADD COLUMN IF NOT EXISTS absence_date date;

UPDATE public.absence_lessons al
SET teacher_id = ar.teacher_id,
    absence_date = ar.absence_date
FROM public.absence_requests ar
WHERE ar.id = al.absence_request_id
  AND (al.teacher_id IS NULL OR al.absence_date IS NULL);

ALTER TABLE public.absence_lessons
  ALTER COLUMN teacher_id SET NOT NULL,
  ALTER COLUMN absence_date SET NOT NULL;

CREATE OR REPLACE FUNCTION private.fill_absence_lesson_request_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT ar.teacher_id, ar.absence_date
  INTO NEW.teacher_id, NEW.absence_date
  FROM public.absence_requests ar
  WHERE ar.id = NEW.absence_request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absence_lessons_fill_request_fields ON public.absence_lessons;
CREATE TRIGGER absence_lessons_fill_request_fields
  BEFORE INSERT OR UPDATE OF absence_request_id ON public.absence_lessons
  FOR EACH ROW EXECUTE FUNCTION private.fill_absence_lesson_request_fields();

-- If a request's teacher or date is ever changed, keep its lessons in step. A clash with another
-- request then fails on the unique index below instead of slipping through.
CREATE OR REPLACE FUNCTION private.sync_absence_lessons_from_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.absence_lessons
  SET teacher_id = NEW.teacher_id,
      absence_date = NEW.absence_date
  WHERE absence_request_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS absence_requests_sync_lessons ON public.absence_requests;
CREATE TRIGGER absence_requests_sync_lessons
  AFTER UPDATE OF teacher_id, absence_date ON public.absence_requests
  FOR EACH ROW
  WHEN (OLD.teacher_id IS DISTINCT FROM NEW.teacher_id OR OLD.absence_date IS DISTINCT FROM NEW.absence_date)
  EXECUTE FUNCTION private.sync_absence_lessons_from_request();

CREATE UNIQUE INDEX IF NOT EXISTS absence_lessons_one_active_per_slot
  ON public.absence_lessons (teacher_id, absence_date, lesson_number)
  WHERE status <> 'rejected';
