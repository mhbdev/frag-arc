import { protectedProcedure, publicProcedure, router } from "../index";
import { faucetRouter } from "./faucet";
import { portfolioRouter } from "./portfolio";
import { vaultsRouter } from "./vaults";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  vaults: vaultsRouter,
  portfolio: portfolioRouter,
  faucet: faucetRouter,
});

export type AppRouter = typeof appRouter;
