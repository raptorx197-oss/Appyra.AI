import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  const body = await req.json();

  const prompt = `
Create website content for a ${body.type} named "${body.name}" in ${body.city}.
Include:
- Hero headline
- Short about section
- Sample menu items
- Opening hours
Cuisine: ${body.cuisine || "general"}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  return NextResponse.json({
    content: completion.choices[0].message.content
  });
}
