# Critique, COD Leak Calculator

## Redesign pass, 2026-10-24 (kinetic type money lab)

This file did not exist before this pass; the redesign is its first entry.

**What changed.** The frontend was rebuilt from the Georgia-serif paper page
into the Kinetic Type Money Lab direction from DESIGN-RESEARCH.md
(section 3.5): the monthly loss set at up to 12vw in Archivo Variable with
its weight driven by the value (300 swelling to 900), the four number inputs
replaced by ruled slider instruments with large readouts, a fifth slider for
the owner's own pain threshold past which the figure turns hot red, and saved
scenarios stacked as typographic specimens. The page was already English;
the README's stale "editorial paper look" line was corrected, the CHANGELOG
gained a 0.3 entry, and DESIGN.md and SECURITY.md were added. No backend
file was touched at all.

**Evidence.**
- Tests before: `tests/test_api.py` passed 26/26.
- Tests after: identical, 26/26, with no test edits.
- Numbers unchanged: the seeded scenarios compute exactly as before,
  "October as it happened" loses 36,250 EGP a month, "If confirmation calls
  land" 26,100, "Black Friday volume, same rate" 94,250, verified by
  recomputing from the seeded inputs after the redesign. The frontend math
  (`calcValues`) is byte-for-byte the formula the old page used; a slider
  cannot produce a value the number input could not.
- The new page serves at `/` with HTTP 200 and the English title; a scan of
  the project tree finds zero lines containing Arabic characters.

**One discrepancy, flagged rather than hidden.** The redesign brief named a
known comparison of 15,884 vs 11,273 EGP on the saved scenarios. That pair
does not exist in the current seeded data and cannot be reproduced from any
seeded or sample-CSV scenario (checked: all seven seeded scenarios and the
three sample import rows). It appears to have come from ad-hoc scenarios
created during the earlier screenshot session, in a database the test suite
has since reseeded. The seeded comparison numbers above are the true,
current ones, and they are unchanged by this pass.

**Gaps, honestly.**
- The weight-and-tween behaviour was verified in code, not in a browser in
  this environment. The tween is a 260ms requestAnimationFrame ease with a
  static final state, and `prefers-reduced-motion` skips it entirely, so the
  failure mode is "number appears instantly", never a wrong number.
- The rate slider caps at 60% and shipping at 150 EGP where the old number
  inputs were unbounded; a scenario outside those ranges can still be loaded
  from the backend via Edit (the slider clamps its display) but cannot be
  typed past the cap from the page. Stores failing more than 60% of orders
  have a bigger problem than this page, but the cap is a real change in
  input range and it is recorded here.
- The pain-threshold slider is a frontend instrument only; it is not saved
  per store, so it resets to 20,000 EGP on reload.
