
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_slots TO authenticated;
GRANT ALL ON public.schedule_slots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_requests TO authenticated;
GRANT ALL ON public.absence_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_lessons TO authenticated;
GRANT ALL ON public.absence_lessons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.substitute_assignments TO authenticated;
GRANT ALL ON public.substitute_assignments TO service_role;
