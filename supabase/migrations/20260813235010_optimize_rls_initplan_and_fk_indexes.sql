-- Covering indexes for the foreign keys reported by the performance advisor.
CREATE INDEX IF NOT EXISTS absence_lessons_substitute_teacher_id_idx
  ON public.absence_lessons (substitute_teacher_id);
CREATE INDEX IF NOT EXISTS absence_requests_teacher_id_idx
  ON public.absence_requests (teacher_id);
CREATE INDEX IF NOT EXISTS substitute_assignments_absence_lesson_id_idx
  ON public.substitute_assignments (absence_lesson_id);

-- Wrap auth.uid() in a scalar subquery so it is evaluated once per query instead of once per row.

DROP POLICY IF EXISTS "admin delete teacher" ON public.teachers;
CREATE POLICY "admin delete teacher" ON public.teachers
  FOR DELETE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin insert teacher" ON public.teachers;
CREATE POLICY "admin insert teacher" ON public.teachers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "self update teacher" ON public.teachers;
CREATE POLICY "self update teacher" ON public.teachers
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "read own role" ON public.user_roles;
CREATE POLICY "read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "insert own absence" ON public.absence_requests;
CREATE POLICY "insert own absence" ON public.absence_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "read own or admin absence" ON public.absence_requests;
CREATE POLICY "read own or admin absence" ON public.absence_requests
  FOR SELECT TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "update absence admin or own pending" ON public.absence_requests;
CREATE POLICY "update absence admin or own pending" ON public.absence_requests
  FOR UPDATE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR (
      status = 'pending'::public.absence_status
      AND EXISTS (
        SELECT 1
        FROM public.teachers t
        WHERE t.id = absence_requests.teacher_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR (
      status = 'pending'::public.absence_status
      AND EXISTS (
        SELECT 1
        FROM public.teachers t
        WHERE t.id = absence_requests.teacher_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "delete own or admin absence" ON public.absence_requests;
CREATE POLICY "delete own or admin absence" ON public.absence_requests
  FOR DELETE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR (
      status = 'pending'::public.absence_status
      AND EXISTS (
        SELECT 1
        FROM public.teachers t
        WHERE t.id = absence_requests.teacher_id
          AND t.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "rw absence lessons" ON public.absence_lessons;
CREATE POLICY "rw absence lessons" ON public.absence_lessons
  FOR ALL TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_lessons.absence_request_id
        AND t.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_lessons.absence_request_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

-- Split the FOR ALL policies into per-command policies so SELECT is no longer
-- covered by two permissive policies on the same table.

DROP POLICY IF EXISTS "own or admin write schedule" ON public.schedule_slots;

CREATE POLICY "insert own or admin schedule" ON public.schedule_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = (SELECT auth.uid())
        AND NOT t.schedule_locked
    )
  );

CREATE POLICY "update own or admin schedule" ON public.schedule_slots
  FOR UPDATE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = (SELECT auth.uid())
        AND NOT t.schedule_locked
    )
  )
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = (SELECT auth.uid())
        AND NOT t.schedule_locked
    )
  );

CREATE POLICY "delete own or admin schedule" ON public.schedule_slots
  FOR DELETE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.teachers t
      WHERE t.id = schedule_slots.teacher_id
        AND t.user_id = (SELECT auth.uid())
        AND NOT t.schedule_locked
    )
  );

DROP POLICY IF EXISTS "write assignments" ON public.substitute_assignments;

CREATE POLICY "insert assignments" ON public.substitute_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "update assignments" ON public.substitute_assignments
  FOR UPDATE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "delete assignments" ON public.substitute_assignments
  FOR DELETE TO authenticated
  USING (
    private.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = substitute_assignments.absence_lesson_id
        AND t.user_id = (SELECT auth.uid())
    )
  );
