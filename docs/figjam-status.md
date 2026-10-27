# FigJam flow status

Board: https://www.figma.com/board/qIflGPGcLYbqobCjAxmAIl

## Current status

The user-flow routing and implementation message labels have been repaired and visually checked.

- Section 04 (`15:929`): 18 existing steps arranged in a top-to-bottom main column with side branches. All 22 damaged connectors were replaced with fresh connectors attached to explicit sides of their source and destination shapes. The behavior and branch labels are unchanged.
- Section 04 now measures 2040 by 3888 canvas units. The rendered screenshot matches those bounds; connector paths stay within the enclosing section.
- Section 05 (`15:931`, inner sequence `14:870`): message labels were shortened to “Commit set and retry record” and “Commit target revision.” Both arrows and labels are visible.
- Screenshots of both updated sections were inspected. No outstanding routing or label-cleanup issue remains from the previous handoff.

The three ER diagram sections remain unchanged. The semantic Mermaid sources are in `diagrams/user-flow.mmd` and `diagrams/implementation-flow.mmd`; Section 04 uses a manually corrected native layout, so automatic regeneration may produce a different arrangement.

## Cause and repair

The generated flow retained distant connector routing points after grouping and movement. Rebinding its endpoints did not remove those cached paths. Replacing the connectors removed the obsolete routing geometry. Future layout changes should retain the section-local coordinate system and verify the rendered connector bounds.

## Implementation follow-up

Target-revision history and persistent retry records remain future schema/service work, as documented in the implementation flow. No runtime or database changes were made during this visual repair.
