import { createTRPCRouter } from "./create-context";
import { matchmakingRouter } from "./routes/matchmaking";

export const appRouter = createTRPCRouter({
  matchmaking: matchmakingRouter,
});

export type AppRouter = typeof appRouter;
