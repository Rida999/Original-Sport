const AUTH_STORAGE_KEY = "original-sport-authenticated";
const AUTH_USER_STORAGE_KEY = "original-sport-auth-user";
const SUPERADMIN_PASSWORD_STORAGE_KEY = "original-sport-superadmin-password";

const SUPERADMIN_USERNAME = "superadmin";
const SUPERADMIN_DEFAULT_PASSWORD = "superadmin";

type SignInResult =
  | { success: true; requiresPasswordChange: false }
  | { success: true; requiresPasswordChange: true }
  | { success: false; requiresPasswordChange: false };

export function isSignedIn() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
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

function completeSignIn(username: string) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, username);
}
