import { NextResponse } from "next/server";
import { getPortfolio } from "@/lib/portfolio";

// Scraping runs here, so Yahoo's cookie and crumb never reach the browser.
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
