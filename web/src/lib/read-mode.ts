import "server-only";
import { connection } from "next/server";

/** `dynamic: false` skips connection() so a page can use ISR. The default stays request-time. */
export interface ReadMode {
  dynamic?: boolean;
}

export async function atRequest(mode?: ReadMode) {
  if (mode?.dynamic !== false) await connection();
}
