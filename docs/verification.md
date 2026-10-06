# Verification

The initial version was checked on Linux with Python's standard-library unittest runner and Chromium through Playwright. Playwright is only a development tool; candidates don't need it to run Room Remix.

- **9 launcher tests passed:** serving the page and bundled assets from an unrelated working directory, room selection, help, occupied ports, invalid arguments, asset-directory traversal protection, and clean Ctrl+C shutdown.
- **30 browser checks passed:** three presets, focus preservation, wall and floor changes, fabric changes, pointer dragging, keyboard movement and rotation, before/after state preservation, reset, bedroom selection and bed rotation, touch dragging, no JavaScript errors, local-only browser requests, and no horizontal overflow at 1024, 720, 390, and 320 CSS pixels.
- The bed was visually checked at all four rotations.
- Python and JavaScript syntax checks passed.

The launcher uses cross-platform standard-library APIs, and START_HERE.md includes macOS, Linux, and Windows commands. Native macOS and Windows execution has not been tested in this Linux workspace. Mobile checks use Chromium's touch and viewport emulation.

Optional WebMCP hooks are feature-detected. Registration, state read-back, valid inputs, and invalid-input guards were checked with a stub registry. Native WebMCP validation was unavailable in the installed browser; regular room interactions don't depend on this experimental API.
