import { createServerFn } from "@tanstack/react-start";

export type { AuthUser, UserRole } from "./auth.server";

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("./auth.server");
  return getSessionUser();
});

export const signInFn = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { authenticate } = await import("./auth.server");
    return authenticate(data.username, data.password);
  });

export const changeInitialPasswordFn = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { finishInitialPasswordChange } = await import("./auth.server");
    return finishInitialPasswordChange(data.password);
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearAuthentication } = await import("./auth.server");
  await clearAuthentication();
  return { ok: true };
});
