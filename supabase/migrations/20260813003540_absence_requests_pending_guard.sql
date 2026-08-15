-- The previous policy was named "own pending" but never checked the status, so a teacher could
-- approve her own absence request directly through the API. Restrict non-admins to requests that
-- are pending both before and after the update, so status can only be decided by an admin.
DROP POLICY IF EXISTS "update absence admin or own pending" ON public.absence_requests;

CREATE POLICY "update absence admin or own pending" ON public.absence_requests
FOR UPDATE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id AND t.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id AND t.user_id = auth.uid()
    )
  )
);

-- Same reasoning for deletes: a teacher may withdraw a pending request, not erase a decided one.
DROP POLICY IF EXISTS "delete own or admin absence" ON public.absence_requests;

CREATE POLICY "delete own or admin absence" ON public.absence_requests
FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.teachers t
      WHERE t.id = absence_requests.teacher_id AND t.user_id = auth.uid()
    )
  )
);
