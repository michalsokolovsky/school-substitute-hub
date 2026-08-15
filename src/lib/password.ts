// Mirrors the auth password rules configured in supabase/config.toml
// (minimum_password_length + password_requirements).
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT = "לפחות 8 תווים, וכוללת אות גדולה, אות קטנה וספרה (באנגלית)";

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`;
  }
  if (!/[a-z]/.test(password)) return "הסיסמה חייבת לכלול אות אנגלית קטנה";
  if (!/[A-Z]/.test(password)) return "הסיסמה חייבת לכלול אות אנגלית גדולה";
  if (!/[0-9]/.test(password)) return "הסיסמה חייבת לכלול ספרה";
  return null;
}
