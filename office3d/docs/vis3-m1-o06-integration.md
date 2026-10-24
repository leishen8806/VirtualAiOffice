# VIS3-M1-O06 Functional Screen Integration Contract

This contract applies when Codex M1 decorative room treatment is integrated with
the shared Office V3 furniture module.

## Functional owners

`office-furniture-v2.js` owns the only functional room screens:

| Logical room | Functional object | World center | Wall |
| --- | --- | --- | --- |
| `review` / A | `会议室 A` screen | `(-27.72, 2.4, -7.5)` | west |
| `plan` / B | `会议室 B` screen | `(-8.78, 2.4, -7.5)` | east |
| `board` | `董事会` screen | `(-8.78, 2.4, -15)` | east |

These screens are backed by the shared `wing.drawSchedule()` and
`wing.drawRoom()` interfaces. They retain the stable logical IDs `A`, `B`,
`review`, and `plan`; they are the only interactive or labelled meeting screens.

## Codex integration rule

Do not add a Codex decorative screen, label, or hotspot that occupies any of the
three functional screen envelopes above. If `office-vis2/completion.js` is
introduced on the target integration branch and renders decorative review/plan
screens, omit or disable those decorative meshes for `review` and `plan`.

Decorative wall treatment may remain when it has no screen geometry, label, or
interaction hotspot in the functional screen envelope. This repository baseline
does not contain `office-vis2/completion.js`; this document is the handoff
contract for the later Codex integration and does not modify Codex-owned files.
