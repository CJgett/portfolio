import { readdir } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const dir = join(process.cwd(), "public", "bg_pics");
  const files = await readdir(dir);
  const pics = files
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => `/bg_pics/${f}`);
  return NextResponse.json(pics);
}
