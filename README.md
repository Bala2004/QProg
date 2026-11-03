# QProg

Learn quantum programming in **Qiskit** or **Cirq**, from Python basics to Grover's search and the QFT, then go deeper with the advanced **QuTiP** track: Hamiltonians, master equations and open quantum systems. Everything has live visuals.

## Run it

There's no build step and nothing to install. Because the app uses ES modules, serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 5173 --directory qprog
```

Then open http://localhost:5173.

## What's inside

The app lives in `qprog/`. Its design principles are in [qprog/DESIGN.md](qprog/DESIGN.md).

| Path | Purpose |
|---|---|
| `qprog/js/pyparse.js`, `qprog/js/interp.js` | Tokenizer, parser and interpreter for the Python subset the lessons use. Errors carry exact line/column spans. |
| `qprog/js/qiskit.js`, `qprog/js/cirq.js` | Sandboxed imitations of the Qiskit 1.x/2.x and Cirq 1.x APIs, with their real error messages plus coaching. |
| `qprog/js/qutip.js` | Sandboxed QuTiP 5: `Qobj` states and operators as dense complex matrices, `tensor`, `ptrace`, entropy and fidelity, and `sesolve`/`mesolve` integrated with an adaptive Dormand–Prince solver (QuTiP's default tolerances). `steadystate` solves the Liouvillian directly. |
| `qprog/js/engine.js`, `qprog/js/sim.js` | Framework-neutral circuit model, statevector simulator (up to 12 qubits), and Qiskit/Cirq text drawers. |
| `qprog/js/check.js` | Challenge checker. It compares your program to a reference and points to the first line that differs. |
| `qprog/js/lessons.js` | The circuit curriculum shared by Qiskit and Cirq: 22 lessons, 21 checked challenges and a quiz per lesson. |
| `qprog/js/lessons-qutip.js`, `qprog/js/tracks.js` | The QuTiP curriculum (9 lessons in 3 modules, each with a checked challenge), and the registry that maps each track to its lessons. |
| `qprog/js/visuals/` | Bloch spheres (gates animate as their true rotations, QuTiP trajectories draw as dots), the SVG circuit diagram, and the amplitude, population, histogram and line charts. `matplotlib.pyplot.plot` calls are recorded and drawn as line charts. |
| `qprog/js/views/` | Workspace (editor + visuals), lesson page, home, playground, cheat sheet, and the Games tab: GateMatch (`games.js`) and StateGuessr (`stateguessr.js`). |
| `qprog/js/videos.js` | Lesson videos: Qiskit track from YouTube's @qiskit, Cirq track from @GoogleQuantumAI. Each ID was checked as embeddable and from the right channel. |

## Python sandbox: what matches real Python

QProg runs a Python subset in the browser, checked against CPython, Qiskit and Cirq output:

- Floats and ints are kept apart (`2.0` prints as `2.0`), and float formatting, `round()` and `%`/`format()`/f-string specs follow CPython, including round-half-to-even on exact ties.
- NumPy arrays track int, float and complex dtypes, and print with NumPy's padding and 75-column wrapping. `Statevector` prints exactly as Qiskit does.
- Supported: `for`/`while … else`, `a, *rest = …`, `*args`/`**kwargs`, `raise`, `global`, `del`, `try`/`except`/`finally`, lambdas, comprehensions and complex literals (`1j`).
- Guard rails: programs stop after 300,000 steps, sequences are capped at 5 million items, and recursion is capped at depth 60. Each limit gives a friendly error instead of freezing the page.

Known limits: no classes, generators or `with`. Integers above 2⁵³ lose exactness, and results above about 10³⁰⁸ raise `OverflowError`; real Python would compute both exactly.

Progress, quiz answers, challenge drafts and playground code are saved in your browser's localStorage. In the Playground, **Copy** or **⤓ .py** exports your script (rename it in the file-name box) so you can run it with real Qiskit, Cirq or QuTiP.

Videos show a thumbnail first and only load the player (from youtube-nocookie.com) when you click play.

## Fonts

- **Glacial Indifference** (body text) loads from cdnfonts.com. If it doesn't load, Questrial is used instead.
- **Michelangelus** (headings) isn't included in this repository. If you have it, put `Michelangelus-Regular`, `-Italic`, `-Bold` and `-BoldItalic` (`.woff2`, or `.ttf`) in `qprog/fonts/`. Without them, headings use Cinzel from Google Fonts.

## Limits of the sandbox

The sandbox imitates the parts of Qiskit, Cirq and QuTiP that the lessons teach. It isn't the full libraries. Everything taught here is real API, so the code also runs in Jupyter with `pip install qiskit qiskit-aer`, `pip install cirq` or `pip install qutip matplotlib`. Running on real hardware (lesson 20) is shown as reference code only.

QuTiP limits: Hilbert spaces up to 256 dimensions (64 for the solvers, 20 for `steadystate`), constant collapse operators, and time-dependent terms given as functions or strings. `mcsolve`, Wigner functions and superoperators aren't included. Solver results agree with QuTiP's to its default tolerances (`atol=1e-8`, `rtol=1e-6`).
