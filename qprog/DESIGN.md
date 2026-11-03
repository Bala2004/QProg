# QProg design ethos

Every change to QProg, including new features, follows four principles:
deep simplicity, form and function married seamlessly, obsessive attention to detail, and people first.

## Simplicity as sophistication
- Remove before adding. No cards inside cards, no decoration that competes with content.
- One header bar per panel. No developer noise (timings, debug counts) in the UI.
- Restrained elevation and glow. Background motion stays slow and faint.

## Form follows function, with purpose
- Each screen has one clear primary action.
- Every element earns its place; if it doesn't help the learner, it goes.
- Section labels in sentence case. Hover brightens subtly; nothing jumps.

## Obsessive attention to detail
- Use the shared tokens in `styles.css` (refinement layer): spacing `--s1`…`--s8`, radii `--r-s/m/l/xl`, motion `--dur-1/2/3`, hairlines `--hair`, elevation `--shadow-1/2`.
- Tabular numerals for anything that counts or ticks. Balanced headings, `pretty` paragraphs.
- Maths in TeX with proper stacked fractions.
- Check every width from a 340px phone to a 1440px desktop: no wrapping, overlap or sideways scroll.

## Human-centred
- Nothing destructive without a way back (Reset is undoable with ⌘Z).
- Visible keyboard focus, labelled controls, results announced to screen readers, a meaningful page title on every route.
- Text contrast of at least 4.5:1; touch targets of at least 40px; respect reduced-motion settings.
- Friendly, specific copy that tells people what happened and what to do next.

## Brand
- Blue-black, deep purple and white. Michelangelus for display, Glacial Indifference for body.
- Framework colours only on framework-specific UI: Qiskit `#6929C4` with white; Cirq `#FBBC05`, `#4285F4`, `#5F6368`; QuTiP black `#000000` with white, edged by a white hairline so it reads on the blue-black background.
- Blocho, the Bloch-sphere mascot, celebrates wins.
