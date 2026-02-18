import { NextResponse } from "next/server";
import bgPics from "../../../data/bgPics.json";

export async function GET() {
  return NextResponse.json(bgPics);
}
