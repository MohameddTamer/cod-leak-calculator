# COD Leak Calculator

A calculator that shows a store owner what failed deliveries cost, in their own numbers: orders per month, failure rate, shipping cost both ways, packaging. It is a static web app now: one page, one script, one stylesheet, no server and no database. A number an owner saw once and forgot changes nothing, while a scenario they saved and can compare against next month does, so saved scenarios live in the browser's localStorage instead.

Default example: 1,000 orders, 25% failed, 65 per parcel one way, 15 packaging. That is 250 failed orders a month, 145 per failed order, and a 36,250 monthly leak, for a problem most stores describe as "normal".

## Run it

Open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve .
```

No install step, no accounts, no sign-in. The first visit seeds seven demo scenarios; clearing the browser's site data reseeds them.

## What it does

- The original calculator, live in the page: failed orders, cost per failed order, monthly and yearly leak, and the saving from a five point drop in the failure rate (capped at the failures that actually exist)
- Saved scenarios, with full create, read, update and delete in the browser. A scenario name cannot repeat, the app refuses the second one instead of quietly overwriting
- A comparison view: tick scenarios and get a table plus an inline SVG bar chart of monthly losses side by side, worst first
- A history list of the most recently touched scenarios
- CSV import of scenarios (`sample_scenarios.csv` is a working example), with a rejection report that names every refused row, its row number and why: duplicates inside the file, names already saved, and malformed numbers are all rejected, never silently merged
- A backup export that downloads the saved scenarios as JSON
- A printable report view (Print report button) that prints the comparison chart and table on a clean page

## Architecture

No backend, no database, no dependencies. `index.html` is the page, `style.css` is the kinetic-type money lab from DESIGN.md, and `app.js` holds every calculation plus the localStorage persistence. The calculation functions are written so they also load under node, which is how the tests run them without a browser. All demo data is fictional.

## What changed from the old version

The previous version was a Python REST API over SQLite with logins and per-store scoping. That whole layer is gone: there are no accounts, no tokens, and no separate stores. Each scenario carries an optional store label, just text on the scenario, and names are unique across the whole list instead of per store. Everything else, the maths, the seed figures, the import rules, the comparison order, is the same as it was.

## Tests

```bash
node --test tests/test_app.js
```

The suite checks the seeded figures, the saving cap, validation refusals, duplicate names, the import rejection report with row numbers, comparison ordering, and that the static page still carries the money lab.

## Known limitations

Scenarios live only in this browser: another device or a cleared cache starts from the seed again, and there is no sync. There is one currency label, EGP, and no conversion. The import expects the exact header in the documented order of names. The kinetic figure needs a browser with variable-font support; without it the number still shows, just without the swelling weight. Seed scenarios, names and numbers are fictional.

## Screenshots

![The leak figure, set at full width](docs/screenshot.png)

The money lab with the sliders parked mid-range: the monthly leak set
at the size of a door, already red because it crossed the pain
threshold. All data on this screen is fictional demo data.
