
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher');
CREATE TYPE public.teacher_type AS ENUM ('regular', 'external');
CREATE TYPE public.slot_status AS ENUM ('teaching', 'free', 'available', 'unavailable');
CREATE TYPE public.absence_status AS ENUM ('pending', 'approved', 'rejected');

-- Teachers
CREATE TABLE public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  type public.teacher_type NOT NULL DEFAULT 'regular',
  schedule_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Schedule slots
CREATE TABLE public.schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  day SMALLINT NOT NULL CHECK (day BETWEEN 0 AND 5),
  lesson_number SMALLINT NOT NULL CHECK (lesson_number BETWEEN 1 AND 12),
  status public.slot_status NOT NULL,
  subject TEXT,
  class_name TEXT,
  grade_level TEXT,
  ability_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, day, lesson_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_slots TO authenticated;
GRANT ALL ON public.schedule_slots TO service_role;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

-- Absence requests
CREATE TABLE public.absence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  absence_date DATE NOT NULL,
  status public.absence_status NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_requests TO authenticated;
GRANT ALL ON public.absence_requests TO service_role;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

-- Absence lessons
CREATE TABLE public.absence_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  absence_request_id UUID NOT NULL REFERENCES public.absence_requests(id) ON DELETE CASCADE,
  lesson_number SMALLINT NOT NULL,
  substitute_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  subject TEXT,
  class_name TEXT,
  grade_level TEXT,
  ability_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (absence_request_id, lesson_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absence_lessons TO authenticated;
GRANT ALL ON public.absence_lessons TO service_role;
ALTER TABLE public.absence_lessons ENABLE ROW LEVEL SECURITY;

-- Substitute assignments (prevent double-booking)
CREATE TABLE public.substitute_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  substitute_teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  absence_lesson_id UUID NOT NULL REFERENCES public.absence_lessons(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  lesson_number SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (substitute_teacher_id, assignment_date, lesson_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.substitute_assignments TO authenticated;
GRANT ALL ON public.substitute_assignments TO service_role;
ALTER TABLE public.substitute_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- teachers: everyone authenticated can read (needed to browse substitutes)
CREATE POLICY "auth read teachers" ON public.teachers FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update teacher" ON public.teachers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert teacher" ON public.teachers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete teacher" ON public.teachers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: readable by owner and admins
CREATE POLICY "read own role" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- schedule_slots: readable by all authenticated; writable by owner (when not locked) or admin
CREATE POLICY "read schedule" ON public.schedule_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "own or admin write schedule" ON public.schedule_slots FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  );

-- absence_requests: owner + admin
CREATE POLICY "read own or admin absence" ON public.absence_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  );
CREATE POLICY "insert own absence" ON public.absence_requests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  );
CREATE POLICY "update absence admin or own pending" ON public.absence_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  );
CREATE POLICY "delete own or admin absence" ON public.absence_requests FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid())
  );

-- absence_lessons: piggyback on parent
CREATE POLICY "rw absence lessons" ON public.absence_lessons FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_request_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.absence_requests ar
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE ar.id = absence_request_id AND t.user_id = auth.uid()
    )
  );

-- substitute_assignments: readable to all authenticated; write via same rule as lessons
CREATE POLICY "read assignments" ON public.substitute_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "write assignments" ON public.substitute_assignments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = absence_lesson_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.absence_lessons al
      JOIN public.absence_requests ar ON ar.id = al.absence_request_id
      JOIN public.teachers t ON t.id = ar.teacher_id
      WHERE al.id = absence_lesson_id AND t.user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_teachers_updated BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_slots_updated BEFORE UPDATE ON public.schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_absence_updated BEFORE UPDATE ON public.absence_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link auth user -> teacher row on signup by email
CREATE OR REPLACE FUNCTION public.link_teacher_on_signup() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.teachers SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'teacher') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_teacher_on_signup();
