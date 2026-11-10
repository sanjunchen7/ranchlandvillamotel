import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { auditLogs, staffSessions, staffUsers } from "@db/schema";

const COOKIE = "rv_staff";
const attempts = new Map<string, { count: number; resetAt: number }>();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieSecurity(req: Request) {
  const forwardedProtocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps = forwardedProtocol ? forwardedProtocol === "https" : new URL(req.url).protocol === "https:";
  // Embedded website previews are cross-site iframes. Strict/Lax cookies are not
  // returned there; production therefore uses Secure + None + CHIPS partitioning.
  return isHttps ? "; SameSite=None; Secure; Partitioned" : "; SameSite=Lax";
}

function ip(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
}

export async function login(req: Request, resHeaders: Headers, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const attemptKey = `login:${ip(req)}:${normalizedEmail}`;
  rateLimit(attemptKey, 8, 15 * 60 * 1000);
  const db = getDb();
  const [user] = await db.select().from(staffUsers).where(and(eq(staffUsers.email, normalizedEmail), eq(staffUsers.active, true))).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
  }
  attempts.delete(attemptKey);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await db.insert(staffSessions).values({ tokenHash: hashToken(token), staffId: user.id, expiresAt });
  resHeaders.append("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Max-Age=43200${cookieSecurity(req)}`);
  return { id: user.id, name: user.name, email: user.email, role: user.role, sessionToken: token };
}

function requestSessionToken(req: Request) {
  const cookies = req.headers.get("cookie") || "";
  const cookieToken = cookies.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (cookieToken) return cookieToken;
  const authorization = req.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

export async function getStaff(req: Request) {
  const token = requestSessionToken(req);
  if (!token) return null;
  const db = getDb();
  const [row] = await db.select({ staff: staffUsers }).from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.staffId, staffUsers.id))
    .where(and(eq(staffSessions.tokenHash, hashToken(token)), gt(staffSessions.expiresAt, new Date()), eq(staffUsers.active, true))).limit(1);
  if (!row) return null;
  return { id: row.staff.id, name: row.staff.name, email: row.staff.email, role: row.staff.role };
}

export async function logout(req: Request, resHeaders: Headers) {
  const token = requestSessionToken(req);
  if (token) await getDb().delete(staffSessions).where(eq(staffSessions.tokenHash, hashToken(token)));
  resHeaders.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Max-Age=0${cookieSecurity(req)}`);
}

export const staffQuery = publicQuery.use(async ({ ctx, next }) => {
  const origin = ctx.req.headers.get("origin");
  const host = ctx.req.headers.get("x-forwarded-host") || ctx.req.headers.get("host");
  if (origin) {
    const originUrl = new URL(origin);
    const requestHost = new URL(ctx.req.url).host;
    const isPlatformPreview = originUrl.protocol === "https:" && (originUrl.host.endsWith(".ok.kimi.link") || originUrl.host.endsWith(".kimi.com"));
    if (originUrl.host !== host && originUrl.host !== requestHost && !isPlatformPreview) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Invalid request origin." });
    }
  }
  const staff = await getStaff(ctx.req);
  if (!staff) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in again." });
  return next({ ctx: { ...ctx, staff } });
});

export const adminQuery = staffQuery.use(async ({ ctx, next }) => {
  if (ctx.staff.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  return next({ ctx });
});

export async function audit(actorStaffId: number | null, action: string, entityType: string, entityId?: string | number, details?: Record<string, unknown>) {
  await getDb().insert(auditLogs).values({ actorStaffId, action, entityType, entityId: entityId == null ? undefined : String(entityId), details });
}
