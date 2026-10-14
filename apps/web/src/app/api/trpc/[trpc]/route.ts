import { appRouter } from "@frag-arc/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { NextRequest } from "next/server";

import { withEvlog } from "@/lib/evlog";
import { identifyEvlogUser } from "@/lib/evlog-auth";

import { createContext } from "../../../../context";

async function handler(req: NextRequest) {
  await identifyEvlogUser(req);
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
  });
}
export const GET = withEvlog(handler);
export const POST = withEvlog(handler);
