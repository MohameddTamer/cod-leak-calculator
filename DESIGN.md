# Design, COD Leak Calculator

## Concept

One number is bleeding money. Set it at the size of a door, make it move when
the inputs move, and let everything else on the page be a quiet instrument
for changing it. This is a money lab: the figure is the experiment, the
sliders are the apparatus, and the saved scenarios are specimens pinned under
it for comparison.

## Palette

- Bone `#F2EFE9`, the lab bench
- Ink `#101010`, type, rules, the figure itself
- Money green `#0E7A3D`, one thing only: what you save when the rate drops
- Hot red `#D92B1F`, the figure, only when the loss crosses the threshold
  the owner set for himself

Two colors at a time, always. The red is earned by the data, never applied
by the theme.

## Type

- **Archivo Variable**, the monthly loss figure. Its weight axis is driven by
  the value itself (300 at nothing, swelling to 900 as the loss grows), so a
  bad month literally looks heavier than a good one. Also carries headings.
- **Space Grotesk**, inputs, labels, tables, secondary figures. Tabular
  numerals throughout, so money columns align.

## Signature layout move

The monthly loss is set at up to 12vw across the top of the page, treated as
architecture, clipped by nothing. Under it, the four inputs are full-width
ruled slider rows, a bill being itemized, each with its readout set large
at the right margin. Saved scenarios are stacked as typographic specimens:
name in Archivo, the loss set big beside it, no cards anywhere.

## Signature interaction

Dragging any slider re-typesets the figure live: the digits tween to the new
value over 260ms while the variable font's weight swells or relaxes with it.
Cross the pain threshold, a fifth slider the owner sets himself, and the
figure turns hot red. Under `prefers-reduced-motion` the tween is skipped and
the same final number and weight appear instantly: the information survives
with the theater removed.

## Deliberately avoided

- No cards, no border radius, no soft shadows, no gradient of any kind.
- No chart library and no decorative chart: the comparison bars are ink
  rectangles in a ruled table's clothing.
- No purple, no dark-mode costume, no emoji. The brand mark is one drawn
  SVG: a funnel with a single red drop escaping it.
- No filler copy. Every sentence on the page is about the leak.
