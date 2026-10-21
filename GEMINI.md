# Project Rules & Guidelines: az-print-ready

## 1. Verification & Check Reporting Integrity
- **Truthful Execution Labels**: Every verification step or check in test reports must be explicitly labeled `(ran)` or `(read only)`.
- **Strict Prohibition**: NEVER label a check `(ran)` unless it was genuinely executed with real assertions, recorded measurements, or programmatic DOM inspection. If a check is inferred by reviewing code, label it `(read only)`.
- **End-to-End Real Flow**: When testing browser output flows (such as Print Backs, Print Fronts, or Save as PDF), test the actual DOM rendered in `#print-root` at the moment of execution rather than inspecting internal state arrays in isolation.

## 2. Typography & Text Standards
- **Zero Em Dashes**: Do NOT use em dashes (Unicode U+2014) anywhere in app copy, button labels, notifications, code comments, or agent responses. Use colons, commas, hyphens (`-`), or parentheses instead.
- **Minimal, User-Facing Copy**: Keep interface text concise, clear, and usable by non-technical shop operators.

## 3. Picture Geometry & Default Sizing
- **No Automatic Cropping**: Newly added pictures at Default must never be auto-cropped. `cropRect` must remain `undefined` (representing the full original image).
- **Exact Aspect Ratio**: The element box for a Default picture must match the image's exact natural aspect ratio (`pxW / pxH`), scaled to the largest dimensions that fit inside the printable area.
- **Crop Modal Alignment**:
  - Opening Crop on a Default variant must display the full image (`cropRect: undefined`).
  - Opening Crop on a sized variant (e.g. 1x1, 2x2, Wallet) must initialize its frame to match the center-cropped area currently visible on the canvas.
  - Resetting crop on a Default variant must return the element box to the original aspect ratio and clear `cropRect`.

## 4. Manual Edits & Stay-Put Mode
- **No Confirmation Popups**: Never prompt the user with "Reset manual changes?" dialogs. Actions apply immediately.
- **Stay-Put Rule**: When a page has manual adjustments (`hasManualEdits` / `stayPut`), modifying a variant's size or properties must only reposition or resize that variant's copies. Other elements on the page must remain in their manual positions.

## 5. Development Test Hooks
- **Production Hygiene**: Any test helper or debug interface mounted on `window` (e.g. `window.__AZ_TEST__`) must be wrapped in `process.env.NODE_ENV !== 'production'` so that production builds remain clean.
- **Clean Code Comments**: Maintain comment hygiene. Avoid decorative separators, narrative changelog comments, or workflow blow-by-blow descriptions in production code.

## 6. Clipboard Synchronization & Precedence
- **Internal Marker Protocol**: In-app cut/copy actions must write a plain-text token (`azpr-internal:<sessionId>:<counter>`) to the system clipboard while saving the element payload in memory.
- **Newest Copy Wins**: On paste, check the system clipboard. If it contains external image data without the active session marker, paste the external image. If the active marker is present, paste the in-app clipboard elements.

## 7. Data Privacy & Persistence Guardrails
- **No Customer Data Persistence**: Customer images, job layouts, and personal identifiers must never be written to `localStorage` or persistent client storage.
- **Dedicated Config Keys**: Only owner-configured application preferences (such as `azpr-prices`) may be persisted, using clear, namespaced keys.

## 8. State Store Invariance in Automated Verification
- **Fresh State Retrieval**: When writing verification scripts or CDP tests that trigger store actions, remember that Zustand states are immutable. Re-fetch `useStore.getState()` after any mutation before asserting on state properties to avoid reading stale references.
