CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO service_role;

ALTER POLICY "rw absence lessons" ON public.absence_lessons
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_lessons.absence_request_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_lessons.absence_request_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "read own or admin absence" ON public.absence_requests
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "update absence admin or own pending" ON public.absence_requests
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "delete own or admin absence" ON public.absence_requests
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "own or admin write schedule" ON public.schedule_slots
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "write assignments" ON public.substitute_assignments
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = auth.uid()
    )
  );

ALTER POLICY "admin delete teacher" ON public.teachers
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "admin insert teacher" ON public.teachers
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "self update teacher" ON public.teachers
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "read own role" ON public.user_roles
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM service_role;
DROP FUNCTION public.has_role(uuid, public.app_role);