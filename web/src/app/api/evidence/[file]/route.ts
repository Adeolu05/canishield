// Serves form-check screenshots from web/public/evidence at request time.
// `next start` only serves public/ files that existed at build time, and these
// are uploaded later. Only names logFormCheck generates are accepted.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const NAME = /^[a-z0-9-]+-(ironwood_ua|full_ua|transparent)-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.(png|jpg)$/;

export async function GET(_request: Request, ctx: RouteContext<"/api/evidence/[file]">) {
  const { file } = await ctx.params;
  if (!NAME.test(file)) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(join(process.cwd(), "public", "evidence", file));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
