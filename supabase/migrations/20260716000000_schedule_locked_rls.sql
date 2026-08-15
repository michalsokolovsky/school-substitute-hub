-- Teachers may not modify schedule_slots when their schedule is locked (admins always can).
ALTER POLICY "own or admin write schedule" ON public.schedule_slots
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      EXISTS (
        SELECT 1
        FROM public.teachers t
        WHERE t.id = schedule_slots.teacher_id
          AND t.user_id = auth.uid()
          AND NOT t.schedule_locked
      )
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      EXISTS (
        SELECT 1
        FROM public.teachers t
        WHERE t.id = schedule_slots.teacher_id
          AND t.user_id = auth.uid()
          AND NOT t.schedule_locked
      )
    )
  );

-- Ensure project owner has admin role (idempotent).
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = lower('7699299@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- Bootstrap: if no admin exists, grant admin to the earliest registered user.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;
