import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { useSession } from "@tanstack/react-start/server";

import { one, query } from "./db.server";

export type UserRole = "admin" | "superadmin";
export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
};

type UserRow = AuthUser & {
  password_hash: string;
  must_change_password: boolean;
  active: boolean;
  failed_login_attempts: number;
  locked_until: string | null;
  session_version: number;
};

type SessionData = {
  userId?: string;
  sessionVersion?: number;
  pendingUserId?: string;
  pendingExpiresAt?: number;
};

const scrypt = promisify(scryptCallback);
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const PASSWORD_KEY_LENGTH = 64;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const getSessionPassword = () => {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Server authentication is not configured.");
  return createHash("sha256")
    .update(`original-sport-session:${databaseUrl}`)
    .digest("hex");
};

export const useAppSession = () =>
  useSession<SessionData>({
    name:
      process.env.NODE_ENV === "production"
        ? "__Host-original-sport-session"
        : "original-sport-session",
    password: getSessionPassword(),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  });

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
};

const verifyPassword = async (password: string, storedHash: string) => {
  const [algorithm, encodedSalt, encodedHash] = storedHash.split("$");
  const validFormat = algorithm === "scrypt" && Boolean(encodedSalt) && Boolean(encodedHash);
  const salt = validFormat ? Buffer.from(encodedSalt, "base64url") : Buffer.alloc(16, 1);
  const expected = validFormat
    ? Buffer.from(encodedHash, "base64url")
    : Buffer.alloc(PASSWORD_KEY_LENGTH, 1);
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
};

let bootstrapPromise: Promise<void> | null = null;

const ensureBootstrapUsers = async () => {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const bootstrapUsers: { username: string; password?: string; role: UserRole }[] = [
      {
        username: "admin",
        password: process.env.AUTH_ADMIN_PASSWORD,
        role: "admin",
      },
      {
        username: "superadmin",
        password: process.env.AUTH_SUPERADMIN_PASSWORD,
        role: "superadmin",
      },
    ];

    for (const user of bootstrapUsers) {
      if (!user.password || user.password.length < 12) continue;
      const passwordHash = await hashPassword(user.password);
      await one(
        `insert into app_users (username, password_hash, role, must_change_password)
         values ($1, $2, $3, true)
         on conflict (username) do nothing
         returning id`,
        [user.username, passwordHash, user.role],
      );
    }
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
};

const findUserByUsername = async (username: string) =>
  one<UserRow>(
    `select id, username, password_hash, role, must_change_password, active,
            failed_login_attempts, locked_until, session_version
     from app_users
     where username = $1`,
    [username],
  );

const findUserById = async (id: string) =>
  one<UserRow>(
    `select id, username, password_hash, role, must_change_password, active,
            failed_login_attempts, locked_until, session_version
     from app_users
     where id = $1`,
    [id],
  );

const publicUser = (user: UserRow): AuthUser => ({
  id: user.id,
  username: user.username,
  role: user.role,
});

const startAuthenticatedSession = async (user: UserRow) => {
  const session = await useAppSession();
  await session.clear();
  const freshSession = await useAppSession();
  await freshSession.update({
    userId: user.id,
    sessionVersion: user.session_version,
  });
};

export const authenticate = async (usernameInput: string, password: string) => {
  if (usernameInput.length > 64 || password.length > 256) {
    return { success: false as const, requiresPasswordChange: false as const };
  }
  await ensureBootstrapUsers();
  const username = usernameInput.trim().toLowerCase();
  const user = await findUserByUsername(username);
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? "invalid");
  const locked = Boolean(user?.locked_until && new Date(user.locked_until).getTime() > Date.now());

  if (!user || !user.active || locked || !passwordMatches) {
    if (user && user.active && !locked) {
      await query(
        `update app_users
         set failed_login_attempts = failed_login_attempts + 1,
             locked_until = case
               when failed_login_attempts + 1 >= $2 then now() + ($3 * interval '1 minute')
               else locked_until
             end
         where id = $1`,
        [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
      );
    }
    return { success: false as const, requiresPasswordChange: false as const };
  }

  await query(
    `update app_users
     set failed_login_attempts = 0, locked_until = null, last_login_at = now()
     where id = $1`,
    [user.id],
  );

  if (user.must_change_password) {
    const session = await useAppSession();
    await session.clear();
    const freshSession = await useAppSession();
    await freshSession.update({
      pendingUserId: user.id,
      pendingExpiresAt: Date.now() + 10 * 60 * 1000,
    });
    return { success: true as const, requiresPasswordChange: true as const };
  }

  await startAuthenticatedSession(user);
  return { success: true as const, requiresPasswordChange: false as const };
};

export const finishInitialPasswordChange = async (newPassword: string) => {
  if (newPassword.length < 12) throw new Error("Use at least 12 characters for the new password.");
  if (newPassword.length > 128) throw new Error("Use no more than 128 characters.");

  const session = await useAppSession();
  const pendingUserId = session.data.pendingUserId;
  const pendingExpiresAt = session.data.pendingExpiresAt ?? 0;
  if (!pendingUserId || pendingExpiresAt < Date.now()) {
    await session.clear();
    throw new Error("Password setup expired. Sign in again.");
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await one<UserRow>(
    `update app_users
     set password_hash = $2,
         must_change_password = false,
         session_version = session_version + 1,
         failed_login_attempts = 0,
         locked_until = null
     where id = $1 and active
     returning id, username, password_hash, role, must_change_password, active,
               failed_login_attempts, locked_until, session_version`,
    [pendingUserId, passwordHash],
  );
  if (!updated) throw new Error("Account is unavailable.");

  await startAuthenticatedSession(updated);
  return publicUser(updated);
};

export const getSessionUser = async (): Promise<AuthUser | null> => {
  const session = await useAppSession();
  const userId = session.data.userId;
  if (!userId) return null;

  const user = await findUserById(userId);
  if (
    !user ||
    !user.active ||
    user.must_change_password ||
    user.session_version !== session.data.sessionVersion
  ) {
    await session.clear();
    return null;
  }
  return publicUser(user);
};

export const requireUser = async (role?: UserRole) => {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required.");
  if (role && user.role !== role) throw new Error("You do not have permission to do that.");
  return user;
};

export const clearAuthentication = async () => {
  const session = await useAppSession();
  await session.clear();
};
