# Portfolio Dashboard

A portfolio tracker built with Next.js, TypeScript and Tailwind CSS. It reads a
fixed list of holdings, pulls the current market price and a couple of
fundamentals off the web, and shows gain/loss per stock and per sector. The
browser checks for new prices every 15 seconds; how often the price behind that
actually changes depends on which source supplied it (see below).

**Live:** https://assessment-tau-three.vercel.app

The first visit after the site has been idle takes around 10 seconds while it
fetches a quote for every holding; it is fast from then on.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

To build and run the production version:

```bash
npm run build
npm start
```

There is nothing to configure — no API keys, no `.env` file. Both data sources
are public web endpoints.

## What you see

- Three summary cards: total investment, present value, overall gain/loss
- One table, grouped by sector, with a summary row per sector
- Gains in green, losses in red, missing data as a dash
- The time of the last successful refresh, plus a manual refresh button

## Project layout

```
data/holdings.json          the portfolio, taken from the source spreadsheet
src/app/page.tsx            the dashboard screen
src/app/api/portfolio/      the one API route the browser talks to
src/lib/yahoo.ts            current market price
src/lib/google.ts           P/E ratio and latest earnings (EPS)
src/lib/portfolio.ts        joins holdings + live data, does the maths
src/lib/cache.ts            TTL cache and the concurrency limiter
src/hooks/usePortfolio.ts   polling from the browser
src/components/             table, summary cards, gain/loss colouring
```

## How the data flows

The browser never talks to Yahoo or Google. It calls `/api/portfolio`, which
runs on the server and does the scraping. That keeps the Yahoo session cookie
server-side and avoids CORS entirely.

```
browser  --15s-->  /api/portfolio  -->  Yahoo   (price, cached 15s)   <- preferred
                                   -->  Google  (price, cached 60s)   <- fallback
                                   -->  Google  (P/E + EPS, cached 10 min)
```

Yahoo is asked first. It answers every symbol in one small request, so its price
can be refreshed at the full 15-second poll rate. When Yahoo is unavailable —
it rate-limits by IP and returns `429` — Google's quote page supplies the price
instead. Google has no lightweight price endpoint, so each holding costs a full
page load: refreshing all 26 takes about 7 seconds and ~10 MB, which is why the
fallback price is cached for 60 seconds rather than 15. It is the shortest
interval that source can sustain without getting blocked.

Every row reports which source its price came from (`cmpSource`) and when that
source actually produced it (`cmpAsOf`), and the heading on the dashboard names
the source in use. A price is never re-stamped as fresh unless the source really
returned a new number.

Investment, portfolio weight and every gain/loss figure are calculated in
`src/lib/portfolio.ts` from the holdings file — none of them are scraped.

## Holdings data

`data/holdings.json` is transcribed from the provided spreadsheet. Total
investment comes to ₹15,43,060, which matches the sheet.

Two deliberate differences from the sheet:

- The three rows below the totals (Infy, Happiest Minds, Easemytrip) are
  positions that were sold — they sit under a "Sold Price" heading and are not
  part of the ₹15,43,060 total. They are not tracked here.
- LTIMindtree is listed in the sheet under its NSE symbol `LTIM`, but Google
  Finance does not resolve that ticker (the company now shows as LTM Ltd). It is
  tracked by its BSE code `540005` instead.

## Known limitations

- **Yahoo may rate-limit you.** Yahoo has no public API and throttles by IP. If
  it refuses the request, the dashboard falls back to Google's price rather than
  showing an empty column, and skips Yahoo for the next five minutes instead of
  retrying a doomed handshake on every poll. While the fallback is in use, prices
  refresh every 60 seconds rather than every 15. The heading says which source is
  live. See `TECHNICAL_NOTES.md`.
- **Corporate actions are not adjusted for.** The purchase prices are as
  recorded in the sheet. Where a stock has since split or issued bonus shares,
  the gain/loss shown will look far worse than reality, because the old purchase
  price is compared against a post-split price.
- **The cache is in-process.** It resets when the server restarts and is not
  shared across instances. Redis would be the production answer.
- **Scraped data is best-effort.** Both sources are public web pages that can
  change shape without notice.
