-- Self-registration: link or create teacher profile when a user signs up.
CREATE OR REPLACE FUNCTION public.link_teacher_on_signup() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _type public.teacher_type;
  _full_name text;
  _phone text;
BEGIN
  _full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  _phone := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  _type := CASE
    WHEN lower(COALESCE(NEW.raw_user_meta_data->>'type', 'regular')) IN (
      'external', 'ממלאת', 'חיצונית', 'חיצוני', 'ממלאת מקום חיצונית'
    ) THEN 'external'::public.teacher_type
    ELSE 'regular'::public.teacher_type
  END;

  UPDATE public.teachers
  SET
    user_id = NEW.id,
    full_name = COALESCE(_full_name, full_name),
    phone = COALESCE(_phone, phone)
  WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;

  -- Only auto-create a profile when the signup carried registration details (our form sends
  -- "type"). OAuth signups reach the app's completion screen instead, so the teacher can pick
  -- her own type rather than silently defaulting to 'regular'.
  IF NEW.raw_user_meta_data ? 'type'
     AND NOT EXISTS (SELECT 1 FROM public.teachers WHERE user_id = NEW.id) THEN
    INSERT INTO public.teachers (email, full_name, phone, type, user_id)
    VALUES (
      NEW.email,
      COALESCE(_full_name, split_part(NEW.email, '@', 1)),
      _phone,
      _type,
      NEW.id
    )
    ON CONFLICT (email) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          full_name = COALESCE(EXCLUDED.full_name, public.teachers.full_name),
          phone = COALESCE(EXCLUDED.phone, public.teachers.phone);
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'teacher')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
