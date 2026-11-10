const STAFF_SESSION_KEY = "rv_staff_session";

export function saveStaffToken(token: string) {
  try { sessionStorage.setItem(STAFF_SESSION_KEY, token); return true; }
  catch { return false; }
}

export function getStaffToken() {
  try { return sessionStorage.getItem(STAFF_SESSION_KEY); }
  catch { return null; }
}

export function clearStaffToken() {
  try { sessionStorage.removeItem(STAFF_SESSION_KEY); }
  catch { /* Storage can be unavailable in a restricted iframe. */ }
}
