import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { publicRouter } from "./publicRouter";
import { reservationRouter } from "./reservationRouter";
import { managementRouter } from "./managementRouter";
import { mediaRouter } from "./mediaRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  public: publicRouter,
  reservations: reservationRouter,
  manage: managementRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;
