# Changelog

## 0.3

The calculator became a money lab. The monthly loss figure is now set at up to 12vw in Archivo Variable, and its weight swells as the loss grows, so the number does not just change, it gets heavier. The four number inputs became ruled slider instruments with large readouts; a fifth slider sets the owner's own pain threshold, past which the figure turns hot red. Saved scenarios stack as typographic specimens instead of cards, and the Georgia serif paper look is retired. English throughout, as it already was; no backend logic or saved number moved. See DESIGN.md for the direction and CRITIQUE.md for the evidence.

## 0.2

The static page became a small app. The calculator moved to frontend/index.html and kept its paper look and its maths, and a Python standard library backend with SQLite now sits behind it. Scenarios can be saved per store and compared, with a table and an inline SVG chart. CSV import landed with a rejection report for duplicates and malformed rows, because an import that merges quietly is worse than no import. Backup export, a recent history list, a printable report view, an app log file and environment based configuration came in the same round. One maths correction: the five point saving is now capped at the failure rate the store actually has, a store at 3% cannot save five points.

## 0.1

One static page. Four inputs, the leak computed in the browser, no backend and nothing saved.
