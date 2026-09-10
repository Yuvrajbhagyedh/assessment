import { NextResponse } from "next/server";
import { getPortfolio } from "@/lib/portfolio";

// Scraping happens here, on the server. The browser only ever sees this route,
// so the Yahoo session cookie and crumb never reach client-side code.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await getPortfolio();
    return NextResponse.json(portfolio);
  } catch (error) {
    console.error("Failed to build portfolio", error);

    return NextResponse.json(
      { message: "Could not load portfolio data. Please try again." },
      { status: 502 }
    );
  }
}
