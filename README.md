# Elect Horse — Auto District (v0.2 experimental)

A Chrome Manifest V3 extension for **https://elect.horse/**. It scans the rendered game board, searches for a connected, equal-population districting plan and draws a color-coded preview on top of the board. It can also *attempt* to apply the plan using synthetic mouse events (the game's click/drag handlers have **not** been verified).

## Install the revised extension

1. Unzip `elect-horse-autodistrict-v0.2.zip` (you can delete the previous unzipped copy).
2. Go to `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the folder containing `manifest.json`.
3. If you've previously loaded v0.1, remove the old extension or load the **newly extracted folder** and disable the older one. Otherwise Chrome may keep running the old code.
4. Open `https://elect.horse` and make sure all of the board is visible. Do not let any on-page overlay obscure it. Refresh the game tab after upgrading.
5. Click **1. Capture board**. Verify the symbols and voter totals in the mini-board before proceeding.
6. Select the **actual** number of district slots shown in the game. For the supplied screenshot, this is **8**: 13 horses, 20 cows, 15 donkeys, and 48 total voters.
7. Click **2. Solve + preview**. If the solution is not a horse victory, try **Deep**. If the preview does not match the board, do not auto-place it.
8. Press **3. Auto-place clicks** to try entering the computed district assignments; check the actual game before submitting. This uses synthetic clicks and is experimental, so it may not work with the game's input handler.

## What's fixed in v0.2

- No longer infers the hex lattice from the fragile within-row gap quartile that caused **“Could not infer hex cell spacing.”** Uses the vertical row spacing and pointy-top hex geometry instead.
- Detects **three parties**: cyan horse, red cow, lavender donkey.
- Detects ponds as separate connected components, using them as extra lattice anchors.
- Detects a hex by its six visible outline edges to avoid interpreting absent spaces as playable empty hexes.
- Allows **2–12 districts**, including 8; defaults to eight on a 48-voter board.
- Scores **horse seat plurality** (more won districts than each other party), rather than incorrectly requiring a strict majority on a three-party board.
- Includes a three-party solver regression test.

## Known limitations

- A screen capture cannot read voter tiles covered by a separate **on-page** overlay. Make the entire board visible before capturing. A popup opened from Chrome's toolbar ordinarily isn't part of the webpage capture, but an in-page overlay can obstruct detection.
- The parser is tuned to the game's bright pixel-art palette. In the mini-board, click a hex to cycle its classification: empty → horse → cow → donkey → water → empty. It cannot add an entirely missing hex outside the detected geometry.
- The board and district count must be reviewed manually: the extension does not query private game state.
- Bigger or irregular boards can exceed the solver's search budget. Deep search explores more states, but there is no guarantee of finding the best arrangement.
- **Auto-place is unverified** against the live site's input handling. A site may ignore programmatic events or require a different dragging/boundary gesture. The preview is independent of clicking and can be used manually.
- No automatic submission or access to the game's source/runtime state.

## Privacy and permissions

Requests only `activeTab` and `scripting`. Capture, classification and computation happen entirely on your machine. No external scripts, uploads, telemetry, or external APIs are involved.

Run `node tests/test.js` and `node tests/test-three-parties.js` to check the graph solver. The parser has been exercised against the user's partially obscured 2048 × 1431 screenshot; it reconstructed 45 visible voters and 13 ponds, with the three obscured voters correctly unavailable from that image.

Not affiliated with elect.horse or its creators.


## v0.3 verification notes
- Official elect.horse client source could not be retrieved. This is an independent screenshot-based extension, not a modification of the original game.
- Added fourth-party correction/classification (yellow Goat detection is heuristic and may require manual correction).
- Corrected search pruning and the `optimal` label; an early target victory is never proof of mathematical optimality.
- The preview is an SVG overlay, **not** a verified boundary submission to the live site. Synthetic clicks are experimental and should not be represented as confirmed working.
- Test via `node tests/test.js && node tests/test-three-parties.js && node tests/test-edge-cases.js`.
- Test screenshots with Chrome at the current zoom level. Confirm all counts and district numbers before solving.
