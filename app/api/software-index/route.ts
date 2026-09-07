import { NextRequest, NextResponse } from "next/server";

import {
  listPublishedSoftwareIndex,
  listPublishedSoftwareInitials,
} from "@/lib/repositories/software";

const PAGE_SIZE = 6;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const letterParam = request.nextUrl.searchParams.get("letter")?.toUpperCase() ?? "ALL";
  const pageParam = request.nextUrl.searchParams.get("page") ?? "1";
  const includeLetters = request.nextUrl.searchParams.get("includeLetters") === "1";

  if (letterParam !== "ALL" && !/^[A-Z]$/.test(letterParam)) {
    return NextResponse.json({ error: "Invalid software initial." }, { status: 400 });
  }
  if (!/^[1-9]\d*$/.test(pageParam)) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }

  const page = Number(pageParam);
  if (!Number.isSafeInteger(page)) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }
  const [indexResult, initialsResult] = await Promise.all([
    listPublishedSoftwareIndex({
      letter: letterParam === "ALL" ? undefined : letterParam,
      page,
      pageSize: PAGE_SIZE,
    }),
    includeLetters ? listPublishedSoftwareInitials() : Promise.resolve(null),
  ]);

  if (indexResult.status === "error") {
    return NextResponse.json({ error: "Unable to load the software index." }, { status: 502 });
  }
  if (initialsResult?.status === "error") {
    return NextResponse.json({ error: "Unable to load software initials." }, { status: 502 });
  }

  const totalPages = Math.max(1, Math.ceil(indexResult.total / PAGE_SIZE));
  return NextResponse.json(
    {
      items: indexResult.items,
      page,
      total: indexResult.total,
      totalPages,
      ...(initialsResult ? { availableLetters: initialsResult.letters } : {}),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
