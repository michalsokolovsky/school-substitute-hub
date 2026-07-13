# Substitute Teacher Management System — MVP Plan

Hebrew-first, RTL, desktop-optimized web app for managing substitute teacher assignments in a single school.

## Stack
- TanStack Start + React (Lovable's stack) — equivalent to your "React + Lovable" ask
- Lovable Cloud (Supabase under the hood) for DB + Auth (email/password)
- Resend for emails (via connector)
- Tailwind + shadcn, RTL layout (`dir="rtl"`, Hebrew UI)

## Build order

### 1. Foundations
- Enable Lovable Cloud
- Set `<html lang="he" dir="rtl">`, Hebrew fonts (Heebo/Assistant), calm neutral palette in `styles.css`
- Connect Resend

### 2. Database schema (single migration)
- `teachers` — id, full_name, email, phone, type (`regular` | `external`), user_id → auth.users, schedule_locked bool
- `user_roles` — (user_id, role) with `app_role` enum (`admin`, `teacher`) + `has_role()` security-definer fn
- `schedule_slots` — teacher_id, day (0–5 Sun–Fri), lesson_number, status (`teaching` | `free` | `available` | `unavailable`), subject, class_name, grade_level, ability_group
- `absence_requests` — teacher_id, absence_date, status (`draft` | `pending` | `approved` | `rejected`), decided_at
- `absence_lessons` — absence_request_id, lesson_number, substitute_teacher_id
- `substitute_assignments` — substitute_teacher_id, date, lesson_number, absence_lesson_id (unique on date+lesson+substitute to prevent double-booking)
- RLS: teachers see/edit their own data; admins see everything (via `has_role`); GRANTs for authenticated + service_role

### 3. Auth
- Login page (email + password)
- Root route: redirect by role (admin → dashboard, teacher → schedule setup or absence flow)
- `_authenticated/` layout gate

### 4. Teacher flows
- **Schedule setup** (one-time): grid Sun–Fri × lessons 1–8; per cell pick status; if `teaching` reveal subject/class/grade + ability group when subject is English/Math; submit locks schedule
- **Report absence**: pick date, check lessons to miss
- **Find substitutes** (per lesson): scoring engine returns ranked candidates
  - Filters: available in that slot, not already assigned that date+lesson, matches search type
  - Score: same subject, same ability group (Eng/Math), consecutive-lesson bonus, same grade, load-balancing (fewer recent assignments first)
  - Implemented as pluggable `scoreCandidate(candidate, context)` summing criterion functions
- **Summary + send for approval**: creates `absence_requests` (pending) + `substitute_assignments` rows, sends email to admin via Resend
- **My requests**: status list

### 5. Admin flows
- Dashboard with pending requests count
- **Requests**: approve/reject → email teacher via Resend, update status
- **Manage teachers**: list + edit any teacher's schedule (unlocks admin edit)
- **Excel import**: upload .xlsx (SheetJS), parse full_name/email/phone/type, create auth users via admin API (server fn), insert teachers
- **History**: all past requests with substitutes per lesson

### 6. Emails (Resend)
- Two templates: "New substitute request" (to admin), "Request approved/rejected" (to teacher)

## Technical notes
- Scoring engine in `src/lib/scoring.ts` — array of `{ name, weight, fn }` criteria
- All mutations via `createServerFn` with `requireSupabaseAuth`
- Excel parse client-side with SheetJS; user creation server-side via `supabaseAdmin.auth.admin.createUser` in server fn (admin-role check)
- Prevent double-booking with unique constraint on `substitute_assignments(substitute_teacher_id, date, lesson_number)`

## Out of scope (MVP)
- Multi-school, mobile-first polish, in-app calling, notifications beyond email, teacher self-editing schedule after lock

Approve and I'll start with Cloud enable + schema + auth, then build screens in the flow order above.
