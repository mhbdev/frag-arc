import type { Session } from "@frag-arc/auth";
import type { Database } from "@frag-arc/db";

export type Context = {
  session: Session | null;
  db: Database;
};
