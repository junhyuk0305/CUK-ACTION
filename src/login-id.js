// Shared by the browser and the id-password-reset Edge Function.
export const LOGIN_DOMAIN = 'id.cuk-action.invalid';
export const LOGIN_ID_RULE = '영문 소문자로 시작하는 영문 소문자·숫자 4~20자';
export const PASSWORD_RULE = '8자 이상, 영문 기준 72자 이하';

export function normalizeLoginId(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
export function isValidLoginId(id) { return /^[a-z][a-z0-9]{3,19}$/.test(id); }
// bcrypt uses only the first 72 bytes, so longer passwords are rejected instead of silently truncated.
export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && new TextEncoder().encode(password).length <= 72;
}
export function loginEmail(id) { return `${normalizeLoginId(id)}@${LOGIN_DOMAIN}`; }
export function loginIdFromEmail(email) {
  const suffix = '@' + LOGIN_DOMAIN;
  return typeof email === 'string' && email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
