# Reader skin contract

Normative companion to [Format v2](SPEC-FORMAT-v2.md). The standard reader v2 skin is the **Public Docs reader skin**. The visible product identity remains **PRODUCT:OS Spec Driven**. This contract adopts presentation and interaction ideas; it does not import another project's content, product scope or acceptance.

## 1. Preserved reader authority

A skin MUST preserve document ids, row ids, heading anchors, routes, forward/reverse references and the native router's destination focus. Layout cannot allocate, rewrite, hide or merge identities. The parsed `SPEC_DATA` and artifact `content.json` MUST remain semantically identical to the native render. Compare their canonical JSON digests before and after applying the skin; compare all source-file raw SHA-256 hashes before and after the build. A mismatch blocks delivery.

The reader still lints before rendering, refuses errors, and marks forced previews invalid. PO, Dev and QA views remain reachable and derive from the same authoritative source. Search keeps its full corpus, result identities, highlighting, navigation and empty-result behavior. The source-ledger view joins each legacy item’s crosswalk row to show the original spelling alongside its immutable key; missing joins are errors. Source-ledger, coverage, decisions, amendments and Open items retain their native meaning and availability rules. A skin cannot substitute visual polish for a gate, review, migration or source-preservation check.

Missing, stale, denied, skipped, failed and not-run evidence MUST remain distinguishable beside the affected claim. Historical receipts retain their pinned source/build/environment; new appearance does not refresh them. Source preservation, typed mapping and demonstrated coverage keep separate totals and numerators. Role filters cannot erase disclosures or manufacture passing counts.

## 2. Adapter boundary

A skin may change layout, spacing, colors, typography, local icons, navigation decoration, BrandCube identity presentation and overlay presentation. It may wrap native controls through an explicit adapter that calls their existing actions. Accessible names and observed states remain accurate. Decorative assets MUST be bundled locally, with applicable asset licenses retained; no remote fonts, icon requests, telemetry or runtime dependency fetching.

A skin MUST NOT edit spec Markdown, manifests, typed records, crosswalks, source ledgers, hashes, identity allocations, gate decisions, embedded data or coverage arithmetic. It cannot replace the parser, search index, router, role projections or evidence resolver with a second authority. Changes to native behavior belong in the reader core and require its own tests and review. Skin assets/version and core assets/version are independently pinned in delivery evidence.

## 3. Keyboard and overlays

All native keyboard actions remain usable with visible focus and accessible names. Drawer/dialog triggers expose their expanded state. An open modal makes the background inert, locks background scrolling, contains Tab and Shift+Tab, and closes with Escape. Closing restores focus to a still-connected opener or a documented safe native fallback. Selecting a page closes the drawer and lets the native router move focus to the destination. Repeated open/close, route changes and resize remove obsolete inert/scroll state and handlers.

Reduced-motion mode provides a static BrandCube presentation and suppresses nonessential transitions. Icons supplement names rather than replacing them. Tooltip decoration cannot become the sole accessible name or obscure keyboard focus. Role switching, theme changes and overlays preserve search and page state according to the native reader contract.

## 4. Offline packages and acceptance evidence

Both artifact and standalone offline packages MUST work from `file://` without network calls. Offline HTML embeds required runtime assets; artifact assets resolve within the package. Local links/anchors and native actions remain usable. Explicit external links may be displayed as links, but are not fetched automatically or reported as locally verified destinations.

Verify native lint/render checks first, then post-skin data/source digest equality, all three role views, search and keyboard actions, overlay focus/inert/scroll restoration, reduced motion and theme switching. Check 375, 768 and 1440 CSS-pixel widths plus any explicitly declared additional device; record viewport, source/build/skin hashes, exact exits, screenshots and limits. The page has no horizontal overflow; wide tables offer an accessible local scroll region. Sidebar geometry remains stable during article scrolling.

Run a meaningful negative control for changed behavior: changed embedded data, an escaping focus target, a removed evidence disclosure or a remote asset must fail its owning assertion. Skin runtime evidence is distinct from source preservation, full scenario coverage, deployment, independent review and owner acceptance. This document defines the acceptance contract; it is not a claim that the future reader implementation has passed it.
