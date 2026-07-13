const AUTH_STORAGE_KEY = "original-sport-authenticated";

export function isSignedIn() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

export function signIn(username: string, password: string) {
  const valid = username.trim() === "admin" && password === "admin";
  if (valid) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, "true");
  }
  return valid;
}

export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
