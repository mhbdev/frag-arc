import { createAuth } from "@frag-arc/auth";
import { createDb } from "@frag-arc/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
