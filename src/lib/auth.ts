const AUTH_STORAGE_KEY = "original-sport-authenticated";
const AUTH_USER_STORAGE_KEY = "original-sport-auth-user";
const SUPERADMIN_PASSWORD_STORAGE_KEY = "original-sport-superadmin-password";

const SUPERADMIN_USERNAME = "superadmin";
const SUPERADMIN_DEFAULT_PASSWORD = "superadmin";
const SUPERADMIN_ONLY_PATHS = ["/receipts", "/reports"];

type UserRole = "admin" | "superadmin";

type SignInResult =
  | { success: true; requiresPasswordChange: false }
  | { success: true; requiresPasswordChange: true }
  | { success: false; requiresPasswordChange: false };

export function isSignedIn() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

export function getCurrentUser(): UserRole | null {
  if (typeof window === "undefined" || !isSignedIn()) return null;
  const user = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
  return user === SUPERADMIN_USERNAME ? "superadmin" : "admin";
}

export function isSuperAdmin() {
  return getCurrentUser() === "superadmin";
}

export function canAccessPath(pathname: string) {
  if (!isSignedIn()) return false;
  if (isSuperAdmin()) return true;
  return !SUPERADMIN_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
}

export function signIn(username: string, password: string): SignInResult {
  if (typeof window === "undefined") {
    return { success: false, requiresPasswordChange: false };
  }

  const normalizedUsername = username.trim().toLowerCase();

  if (normalizedUsername === "admin" && password === "admin") {
    completeSignIn("admin");
    return { success: true, requiresPasswordChange: false };
  }

  if (normalizedUsername === SUPERADMIN_USERNAME) {
    const savedPassword = window.localStorage.getItem(SUPERADMIN_PASSWORD_STORAGE_KEY);
    const activePassword = savedPassword ?? SUPERADMIN_DEFAULT_PASSWORD;

    if (password !== activePassword) {
      return { success: false, requiresPasswordChange: false };
    }

    if (!savedPassword) {
      return { success: true, requiresPasswordChange: true };
    }

    completeSignIn(SUPERADMIN_USERNAME);
    return { success: true, requiresPasswordChange: false };
  }

  return { success: false, requiresPasswordChange: false };
}

export function changeSuperAdminPassword(password: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUPERADMIN_PASSWORD_STORAGE_KEY, password);
  completeSignIn(SUPERADMIN_USERNAME);
}

export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

function completeSignIn(username: UserRole) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, username);
}
