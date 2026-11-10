import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { audit, getStaff, login, logout, staffQuery } from "./staff";
import { getDb } from "./queries/connection";
import { staffUsers } from "@db/schema";

export const authRouter = createRouter({
  me: publicQuery.query(async ({ ctx }) => getStaff(ctx.req)),
  login: publicQuery.input(z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) })).mutation(async ({ ctx, input }) => {
    const staff = await login(ctx.req, ctx.resHeaders, input.email, input.password);
    await audit(staff.id, "STAFF_LOGIN", "user", staff.id);
    return staff;
  }),
  logout: publicQuery.mutation(async ({ ctx }) => {
    await logout(ctx.req, ctx.resHeaders);
    return { ok: true };
  }),
  changePassword: staffQuery.input(z.object({ currentPassword: z.string(), newPassword: z.string().min(12).max(200).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, ctx.staff.id)).limit(1);
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
    await db.update(staffUsers).set({ passwordHash: await bcrypt.hash(input.newPassword, 12) }).where(eq(staffUsers.id, user.id));
    await audit(ctx.staff.id, "PASSWORD_CHANGED", "user", user.id);
    return { ok: true };
  }),
});
