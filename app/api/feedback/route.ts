import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const feedback = await req.json();
  console.log("FEEDBACK:", feedback);
  return NextResponse.json({ success: true });
}
