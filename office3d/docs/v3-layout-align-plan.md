# V3 Align Layout

`LAYOUT_V3_ALIGN` is an opt-in V3 layout variant. It is selected only by
`?layout=3&align=1`; `LAYOUT_V3` remains the default V3 contract.

## Geometry contract

- Fifteen rooms form the interior program, including four display rooms.
- `west-open` is a 19.5m x 10m (195m2) shared operations, quality, and safety island.
- Board uses its east door. The north and south transfer bands are at least 1.5m wide.
- Four display rooms use doors facing an interior circulation lane; their display seating is non-functional.
- Review A and Plan B have 8 and 6 meeting seats respectively.

## Navigation contract

The public circulation graph is derived from the selected layout's room geometry,
ring dimensions, door exteriors, and `publicPathNodes`. The four explicit
junctions preserve access through the north and south west-side transfer bands.
Tests prove that the entrance reaches every room door, workstation exit, meeting
seat, and lounge seat.

## Source of truth

The machine-readable coordinates are in
[`v3-layout-align-plan.json`](./v3-layout-align-plan.json). The checker compares
that document with the frozen runtime layout, including regions, employee seats,
meeting capacity, ring values, and public-path junctions.
