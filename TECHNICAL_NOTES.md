# Technical notes

The problems that actually took time on this, and what I did about them.

## 1. Neither data source has an API

Yahoo Finance and Google Finance both dropped their public APIs years ago, so
the only options are unofficial libraries or reading the pages/endpoints their
own sites use. I went with the latter so that every request the app makes is
something I can explain.

**Yahoo.** Their website calls `query2.finance.yahoo.com/v7/finance/quote`. Since
2023 that endpoint rejects anything without a session cookie and a matching
"crumb" token. The handshake in `src/lib/yahoo.ts` reproduces what a browser
does:

1. request `fc.yahoo.com`, which sets an `A3` cookie (the response is a 404 —
   only the `Set-Cookie` header matters)
2. exchange that cookie for a crumb at `/v1/test/getcrumb`
3. send cookie + crumb on every quote request

The session is reused until a request comes back `401`, at which point it is
thrown away and rebuilt once. The endpoint takes a comma-separated list, so all
26 holdings are fetched in **two** requests, not 26.

**Google.** No endpoint at all, so `src/lib/google.ts` fetches the quote page and
parses it with cheerio.

## 2. Scraping HTML that is designed to change

Google's class names are minified and get regenerated on every deploy —
selecting on `.dO6ijd` would work today and break silently next month. Two
things make the parsing hold up better:

- **Select on visible text, not class names.** `readStat()` looks for a leaf
  `<div>` whose text is exactly `"P/E ratio"` and reads its next sibling. The
  label is what users see, so it changes far less often than the markup.
- **Scope to `<main>`.** This one bit me. My first version took the first price
  element on the page and every single stock came back at ₹27,540.95 — the Nifty
  value, because Google renders a market-movers table *above* the quote. There
  are 66 price elements on a quote page and only 6 are inside `<main>`.

The lesson I took from it: a scraper that returns wrong data is worse than one
that returns nothing, so the fix was to narrow the search area rather than add
more specific selectors.

## 3. Rate limiting

Polling every 15 seconds with 26 holdings is 104 outbound requests per minute if
written naively. That gets blocked quickly. Three things keep it down:

- **Different TTLs for different data.** Yahoo prices are cached for 15 seconds
  — exactly the poll interval, which means N browser tabs cost the same as one.
  P/E and EPS change quarterly, so they are cached for 10 minutes. That alone
  removes ~97% of the Google traffic.
- **The fallback price gets its own, shorter cache.** Google's price and its
  fundamentals arrive on the same page but go stale at very different rates, so
  they are stored separately: 60 seconds for the price, 10 minutes for P/E and
  EPS. Keeping them together was a real bug — the price inherited the 10-minute
  TTL, so the dashboard polled every 15 seconds while the price underneath it
  only moved every 10 minutes. 60 seconds is the floor for this source: there is
  no lightweight Google price endpoint, and refreshing all 26 quote pages costs
  about 7 seconds and ~10 MB, so a 15-second TTL would mean scraping almost
  continuously and would get us blocked.
- **Batching.** Yahoo accepts 20 symbols per call, so the price fetch is 2
  requests instead of 26.
- **A concurrency limit.** `mapWithLimit` runs 4 Google fetches at a time rather
  than firing 26 in parallel. 26 simultaneous connections is the fastest way to
  look like a bot. The trade-off is a slower cold start — I measured 7.5s for the
  first load, against 0.29s once the cache is warm.

## 4. Partial failure

The thing I most wanted to avoid was one bad ticker blanking the whole
dashboard. Failure is handled at three levels:

- **Per stock.** `loadQuote` catches its own errors and returns a quote with an
  `error` field. The row still renders, with a "stale" badge.
- **Per field.** Every live field is optional. If there is no price, the app
  leaves `presentValue` and `gainLoss` *undefined* and renders a dash. It does
  not fall back to zero — a zero would show as a 100% loss and quietly corrupt
  the sector and portfolio totals. Sector sums treat an unpriced holding as
  flat instead of as a wipeout.
- **Per source.** If Yahoo is unreachable, Google's price is used instead, so
  the CMP column keeps working. This is not hypothetical — Yahoo was returning
  `429 Too Many Requests` from my IP throughout development, and the fallback is
  the reason the dashboard still worked. After a refusal, Yahoo is skipped for
  five minutes; without that backoff every 15-second poll spent ~450 ms on a
  handshake that had no chance of succeeding.

Because the fallback is not hypothetical, the dashboard does not pretend it is.
Each row carries `cmpSource` and `cmpAsOf` — which source produced the price and
when — and the heading names the source actually in use rather than always
crediting Yahoo. A cached price is never re-stamped with a new time; the
timestamp only moves when a source really returned a new number.

On the client, a failed poll keeps the last good data on screen and shows a
banner. Replacing a working table with an error page because one refresh failed
is worse than showing data that is 15 seconds stale.

## 5. Symbol mapping

The spreadsheet mixes NSE symbols (`HDFCBANK`) with BSE scrip codes (`532174`),
and each provider wants its own format:

| Sheet          | Yahoo         | Google           |
| -------------- | ------------- | ---------------- |
| NSE `HDFCBANK` | `HDFCBANK.NS` | `HDFCBANK:NSE`   |
| BSE `532174`   | `532174.BO`   | `532174:BOM`     |

Note Google uses `BOM`, not `BSE`. One holding needed changing outright:
LTIMindtree does not resolve as `LTIM` on Google, so it is tracked by BSE code
`540005`.

## 6. Working out which rows are actually holdings

The sheet lists 29 stocks, but only 26 of them are current positions. Infy,
Happiest Minds and Easemytrip sit *below* the totals row, under a "Sold Price"
heading with a realised gain/loss beside them — they are closed trades, and the
sheet's own total excludes them.

Getting this wrong would have quietly broken every percentage on the dashboard,
since portfolio weight is each holding divided by the total. The check I used
was arithmetic: my transcribed holdings sum to ₹15,43,060, which matches the
sheet's total cell exactly. If I had included the sold positions it would not
have.

I also shortened the sector labels — the sheet says "Financial Sector", "Tech
Sector" and "Pipe Sector"; I used "Financials", "Technology" and "Pipes", which
is the wording the brief itself uses in its example.

## 7. A required column that no source actually publishes

The brief asks for "Latest Earnings" from Google Finance. Google has no field
by that name. What it does publish is **EPS** — earnings per share — and that is
what the spreadsheet's own column holds, so that is what I mapped it to.

The figures will not match the sheet exactly, and that is expected rather than a
bug: the sheet is a snapshot from when it was written, Google's EPS is trailing
twelve months. I treated this as a documented interpretation instead of
pretending the two sources agree.

The same honesty applies to P/E. Google genuinely does not publish it for some
of these stocks — Savani Financials, Gensol and Deepak Nitrite among them — and
the spreadsheet shows `#N/A` for Savani too. Those cells render as a dash. I
would rather show nothing than invent a plausible-looking number.

## 8. Gain/loss figures that look wrong but are not

HDFC Bank shows roughly a 53% loss and Bajaj Finance around 84%. Both look like
calculation errors and neither is. The arithmetic is correct; the two inputs
come from opposite sides of a corporate action. The purchase prices recorded in
the sheet are pre-split, the live prices are post-split, so the comparison is
apples to oranges.

There were two ways to handle it. Adjust the historical cost automatically —
which needs a corporate-actions feed I do not have, and means silently rewriting
someone's recorded purchase price. Or show the figure the data actually produces
and state the limitation plainly. I chose the second: a wrong number the user
cannot see is more dangerous than one they have been warned about.

## 9. Rendering

- The table re-renders whenever the portfolio data changes. `StockRow` is
  deliberately *not* wrapped in `memo`: every API response is parsed fresh, so
  each row arrives as a brand-new object and `memo`'s shallow prop comparison
  would fail every time. Making it effective would mean reconciling incoming
  data against the existing row objects so unchanged rows kept their identity —
  real complexity, added solely to enable an optimisation. With 26 holdings the
  re-render costs nothing, so I kept the simpler version.
- Colour logic lives in one `GainLoss` component so the rule is identical in
  rows, sector summaries and the header cards.
- `Intl.NumberFormat("en-IN")` handles the lakh/crore digit grouping, rather
  than formatting rupees by hand.
- 11 columns of rupee amounts need roughly 1200px, so there are two layouts.
  At 1280px and wider the full table is shown. Below that each holding is drawn
  as a card under its sector heading, carrying the same 11 fields as labelled
  pairs. Both are rendered from the same `sectors` prop and share the same
  formatting helpers, so there is no second copy of any figure. The alternative
  was a table that scrolls sideways, which hides the stock name exactly when you
  need it to read the row.
- `usePortfolio` holds an `inFlight` ref so a slow response cannot cause polls to
  stack up on each other.

## What I would do next

- Move the cache to Redis so it survives restarts and is shared between
  instances.
- Pull in a corporate-actions feed so pre-split purchase prices can be adjusted,
  which is the proper fix for the distortion described in section 8.
- Switch the refresh to server-sent events so the server pushes changes instead
  of the browser asking 4 times a minute.
- Add tests around `buildRow` and `groupBySector`; they are pure functions and
  the arithmetic is the part that most needs to be right.
