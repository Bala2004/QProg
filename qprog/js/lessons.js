// QProg curriculum. Inline code in prose uses ~tildes~; code blocks are runnable in the sandbox.
import { blochVector } from './sim.js';

export const MODULES = [
  { id: 'm0', title: 'Foundations', sub: 'Python, qubits and your first circuit' },
  { id: 'm1', title: 'Single-Qubit Gates', sub: 'Flip, superpose, phase and rotate' },
  { id: 'm2', title: 'Many Qubits', sub: 'Bit order, control and entanglement' },
  { id: 'm3', title: 'Simulation Toolkit', sub: 'Statevectors, circuits as objects' },
  { id: 'm4', title: 'Algorithms', sub: 'Where quantum wins' },
  { id: 'm5', title: 'Going Further', sub: 'Parameters, hardware and beyond' },
];

const QIMPORT = 'from qiskit import QuantumCircuit';

export const LESSONS = [
  // ------------------------------------------------------------------ M0
  {
    id: 'python-basics', module: 'm0', title: 'Python for Quantum Code', minutes: 10,
    blurb: 'The exact slice of Python you need: variables, lists, loops, functions and f-strings.',
    blocks: [
      { t: 'md', v: `Both **Qiskit** (by IBM) and **Cirq** (by Google) are *Python libraries*. You describe a quantum circuit by writing ordinary Python, and the library turns it into something a simulator — or a real quantum chip — can run.

You only need a small slice of Python to get going. Here it is, in one place.

### Variables & numbers
A variable is a name for a value. ~n = 3~ stores 3. Python does maths with ~+ - * /~, powers with ~**~ (so ~2 ** n~ is 2ⁿ — you'll see that a lot, because n qubits have 2ⁿ possible outcomes).

### Lists & range
~[0, 1, 2]~ is a list. ~range(3)~ produces 0, 1, 2 — **Python counts from 0**, and so do qubit numbers.

### Loops
~for i in range(3):~ repeats the indented block for i = 0, 1, 2. Indentation (4 spaces) is how Python groups code — get it wrong and you'll see an ~IndentationError~.

### Functions
~def name(args):~ packages reusable code; ~return~ hands back a value.

### f-strings
~f"qubit {i} is ready"~ drops values into text. ~{x:03b}~ formats a number as a 3-digit binary string — perfect for measurement outcomes.` },
      { t: 'code', title: 'Python warm-up', both: `n = 3
outcomes = 2 ** n
print(f"{n} qubits have {outcomes} possible outcomes")

qubits = list(range(n))
print("Qubit indices:", qubits)

def as_bits(value, width):
    return f"{value:0{width}b}"

for v in range(outcomes):
    print(v, "->", as_bits(v, n))` },
      { t: 'callout', kind: 'tip', v: `Every code block in QProg is live. Press **Try it** to load it into the editor on the right. Change something and watch the output update — then break it on purpose to see how errors are explained.` },
    ],
    quiz: { q: 'What does ~list(range(4))~ produce?', options: ['[1, 2, 3, 4]', '[0, 1, 2, 3]', '[0, 1, 2, 3, 4]', '4'], answer: 1, why: 'range(4) starts at 0 and stops before 4 — the same way qubits are numbered 0 … n−1.' },
    exercise: {
      prompt: `Write a function ~bitstrings(n)~ that **returns a list** of every n-bit string in order (for n = 2: ~['00', '01', '10', '11']~). Then print ~bitstrings(2)~ and ~bitstrings(3)~ on separate lines.`,
      starter: { both: `def bitstrings(n):
    result = []
    # TODO: loop over every value from 0 to 2**n - 1
    # and append it formatted as an n-digit binary string
    return result

print(bitstrings(2))
print(bitstrings(3))` },
      solution: { both: `def bitstrings(n):
    result = []
    for v in range(2 ** n):
        result.append(f"{v:0{n}b}")
    return result

print(bitstrings(2))
print(bitstrings(3))` },
      check: [{ type: 'stdout', same: true }],
      hints: ['~range(2 ** n)~ gives every value you need.', 'Format with ~f"{v:0{n}b}"~ — the inner ~{n}~ sets the width.', 'Use ~result.append(...)~ inside the loop.'],
    },
  },
  {
    id: 'qubits', module: 'm0', title: 'Bits, Qubits & Your First Circuit', minutes: 12,
    blurb: 'What a qubit really is, how we write its state, and how to create one in code.',
    blocks: [
      { t: 'md', v: `A classical **bit** is either 0 or 1. A **qubit** has two basis states too, written with "ket" notation as $\\ket{0}$ and $\\ket{1}$ — but it can also be in a **superposition** of both:

$$\\ket{\\psi} = \\alpha\\ket{0} + \\beta\\ket{1}$$

$\\alpha$ and $\\beta$ are *amplitudes* (complex numbers). They aren't probabilities themselves — **squaring their size gives the probabilities**: you measure 0 with probability $|\\alpha|^2$ and 1 with probability $|\\beta|^2$, so $|\\alpha|^2 + |\\beta|^2 = 1$.

### A first look at the Bloch sphere
Every single-qubit state is a point on a sphere: **$\\ket{0}$ is the north pole, $\\ket{1}$ the south pole**, and gates rotate the arrow between them. Click a few gates below to get a feel for it — the next lesson explores the sphere properly.` },
      { t: 'widget', w: 'gate-lab', n: 1, gates: ['X', 'H', 'Z', 'S', 'Ry(π/4)'], caption: 'Notice that Z changes nothing in the probabilities — yet H followed by Z lands somewhere new. That hidden "phase" is what makes quantum computing powerful.' },
      { t: 'md', v: `### Your first circuit
A **quantum circuit** is a recipe: start with qubits in $\\ket{0}$, apply gates, then measure. Here's how each framework sets one up.` },
      {
        t: 'code', title: 'Creating qubits and an empty circuit',
        qiskit: `from qiskit import QuantumCircuit

# 2 qubits (and no classical bits yet)
qc = QuantumCircuit(2)
print("Qubits:", qc.num_qubits)
print(qc)`,
        cirq: `import cirq

# Cirq qubits are objects. LineQubits sit on a numbered line.
q0 = cirq.LineQubit(0)
q1 = cirq.LineQubit(1)
print(q0, q1)

circuit = cirq.Circuit()
print("Moments in circuit:", len(circuit))`,
      },
      { t: 'md', qiskit: `In Qiskit, **qubits are just numbers**: ~QuantumCircuit(2)~ gives you qubits 0 and 1, and gates are *methods on the circuit*: ~qc.h(0)~.`, cirq: `In Cirq, **qubits are objects** you create first (~cirq.LineQubit(0)~), and gates are objects you *apply to* qubits: ~cirq.H(q0)~. That produces an *operation*, which you add to a ~cirq.Circuit~.` },
    ],
    quiz: { q: 'A qubit is in the state $0.6\\ket{0} + 0.8\\ket{1}$. What is the probability of measuring 1?', options: ['0.8', '0.64', '0.36', '0.2'], answer: 1, why: 'Probability = $|\\text{amplitude}|^2$ so $P(1) = 0.8^2 = 0.64$ (and $0.6^2 = 0.36$ for 0 — together they make 1).' },
    exercise: {
      prompt: { qiskit: 'Create a circuit with **3 qubits** called ~qc~ and print its number of qubits.', cirq: 'Create a list of **3 LineQubits** using ~cirq.LineQubit.range(3)~ and print the list.' },
      starter: { qiskit: `from qiskit import QuantumCircuit

# TODO: create a 3-qubit circuit and print qc.num_qubits
`, cirq: `import cirq

# TODO: make three qubits with cirq.LineQubit.range(...) and print them
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(3)
print(qc.num_qubits)`, cirq: `import cirq

qubits = cirq.LineQubit.range(3)
print(qubits)` },
      check: [{ type: 'stdout', same: true }],
      hints: { qiskit: ['~QuantumCircuit(3)~ makes three qubits.', 'Then ~print(qc.num_qubits)~.'], cirq: ['~cirq.LineQubit.range(3)~ returns a list of 3 qubits.', 'Store it in a variable and ~print~ it.'] },
    },
  },
  {
    id: 'bloch-sphere', module: 'm0', title: 'The Bloch Sphere', minutes: 15,
    blurb: 'Every single-qubit state as a point on a sphere — what θ and φ mean, and why it matters.',
    blocks: [
      { t: 'md', v: `A classical **bit** is either 0 or 1 — two points. A **probabilistic bit** is 0 with probability $p$ and 1 with probability $1 - p$ — any point on a line between them. A **qubit** needs more room: its states live on the surface of a sphere, the **Bloch sphere**.

- **Pure states** sit *on* the surface.
- **Mixed states** (statistical mixtures, more on those below) sit *inside* it.

$\\ket{0}$ is the north pole and $\\ket{1}$ the south pole. Every other point is a superposition of the two.` },
      { t: 'md', v: `### The one formula to remember
Any pure single-qubit state can be written using two angles:

$$\\ket{\\psi} = \\cos\\frac{\\theta}{2}\\,\\ket{0} + e^{i\\phi}\\sin\\frac{\\theta}{2}\\,\\ket{1}$$

- **θ (theta)**, from 0 to π, is how far the arrow tilts down from $\\ket{0}$. It alone sets the probabilities: $P(0) = \\cos^2\\frac{\\theta}{2}$ and $P(1) = \\sin^2\\frac{\\theta}{2}$.
- **φ (phi)**, from 0 to 2π, is how far the arrow turns around the vertical axis. It's the **relative phase** between $\\ket{0}$ and $\\ket{1}$ — invisible to a measurement in the 0/1 basis, but crucial for interference.

Play with both angles below. Watch which numbers change when you move θ, and which when you move φ.` },
      { t: 'widget', w: 'bloch-explorer' },
      { t: 'md', v: `### Why θ/2, not θ?
This is **not** ordinary 3D geometry. On the sphere, $\\ket{0}$ and $\\ket{1}$ are 180° apart, yet as vectors they are *orthogonal* — at "90°" in the quantum sense. Halving the angle makes both pictures agree: opposite points on the Bloch sphere are always orthogonal states.

### Global phase doesn't matter
Multiplying a whole state by $e^{i\\gamma}$ changes nothing you could ever measure, so the Bloch sphere ignores it — that's why the formula has no phase on $\\ket{0}$. Only the **relative** (local) phase φ between the two amplitudes is physical. Try the global-phase slider in the widget: the amplitudes change, the arrow doesn't.

### From angles to coordinates
The arrow's tip is at

$$(x, y, z) = (\\sin\\theta\\cos\\phi,\\ \\sin\\theta\\sin\\phi,\\ \\cos\\theta)$$

| State | θ | φ | Point $(x, y, z)$ |
|---|---|---|---|
| $\\ket{0}$ | $0$ | — | $(0, 0, 1)$ — north pole |
| $\\ket{1}$ | $\\pi$ | — | $(0, 0, -1)$ — south pole |
| $\\ket{+}$ | $\\frac{\\pi}{2}$ | $0$ | $(1, 0, 0)$ |
| $\\ket{-}$ | $\\frac{\\pi}{2}$ | $\\pi$ | $(-1, 0, 0)$ |
| $\\ket{+i}$ | $\\frac{\\pi}{2}$ | $\\frac{\\pi}{2}$ | $(0, 1, 0)$ |
| $\\ket{-i}$ | $\\frac{\\pi}{2}$ | $\\frac{3\\pi}{2}$ | $(0, -1, 0)$ |` },
      { t: 'md', v: `### Worked examples
**1.** Where is $\\frac{1}{\\sqrt{2}}\\ket{0} + \\frac{1}{\\sqrt{2}}\\ket{1}$?

Match it to the formula. $\\cos\\frac{\\theta}{2} = \\frac{1}{\\sqrt{2}}$, so $\\frac{\\theta}{2} = \\frac{\\pi}{4}$ and $\\theta = \\frac{\\pi}{2}$ — the equator. Then $e^{i\\phi}\\sin\\frac{\\theta}{2} = \\frac{1}{\\sqrt{2}}$ means $e^{i\\phi} = 1$, so $\\cos\\phi = 1$, $\\sin\\phi = 0$ and $\\phi = 0$. The point is $(1, 0, 0)$: the **+x axis**, the state $\\ket{+}$.

**2.** Where is $\\frac{1}{\\sqrt{2}}\\ket{0} + \\frac{i}{\\sqrt{2}}\\ket{1}$?

Again $\\theta = \\frac{\\pi}{2}$. Now $e^{i\\phi} = i$, so $\\cos\\phi = 0$, $\\sin\\phi = 1$ and $\\phi = \\frac{\\pi}{2}$. The point is the **+y axis**, the state $\\ket{+i}$. Same probabilities as example 1 — a different place on the sphere.

**3.** Where is $\\frac{1}{2}\\ket{0}\\bra{0} + \\frac{1}{2}\\ket{1}\\bra{1}$?

This isn't a ket at all — it's a **mixed state**: "$\\ket{0}$ half the time, $\\ket{1}$ the other half", with no phase relationship between them. Both outcomes are equally likely and no direction is preferred, so its only possible location is the **centre** of the sphere. As a density matrix it's

$$\\rho = \\frac{1}{2}\\ket{0}\\bra{0} + \\frac{1}{2}\\ket{1}\\bra{1} = \\begin{pmatrix} \\frac{1}{2} & 0 \\\\ 0 & \\frac{1}{2} \\end{pmatrix}$$` },
      {
        t: 'code', title: 'Angles to a point on the sphere', both: `import math

def bloch_point(theta, phi):
    x = math.sin(theta) * math.cos(phi)
    y = math.sin(theta) * math.sin(phi)
    z = math.cos(theta)
    return x, y, z

states = [
    ("|0>", 0, 0),
    ("|+>", math.pi / 2, 0),
    ("|+i>", math.pi / 2, math.pi / 2),
    ("tilted", math.pi / 3, math.pi / 4),
]
for name, theta, phi in states:
    x, y, z = bloch_point(theta, phi)
    p1 = math.sin(theta / 2) ** 2
    print(f"{name:7} x = {x:5.2f}  y = {y:5.2f}  z = {z:5.2f}   P(1) = {p1:.2f}")`,
      },
      {
        t: 'code', title: 'Amplitudes back to angles', both: `import math

def bloch_angles(alpha, beta):
    # assumes the global phase is removed, so alpha is real and >= 0
    theta = 2 * math.acos(abs(alpha))
    phi = math.atan2(beta.imag, beta.real) if abs(beta) > 1e-9 else 0.0
    return theta, phi

s = 1 / math.sqrt(2)
examples = [
    ("example 1", s, complex(s, 0)),   # (|0> + |1>)/√2
    ("example 2", s, complex(0, s)),   # (|0> + i|1>)/√2
]
for label, alpha, beta in examples:
    theta, phi = bloch_angles(alpha, beta)
    print(f"{label}: θ = {theta / math.pi:.2f}π, φ = {phi / math.pi:.2f}π")`,
      },
      { t: 'md', v: `### Gates are rotations
Every single-qubit gate is a rotation of the Bloch sphere. **X**, **Y** and **Z** are half-turns (180°) about their own axes; **H** is a half-turn about the diagonal between x and z; **S** and **T** are quarter- and eighth-turns about z. For example, Z turns $\\ket{+}$ into $\\ket{-}$:

$$Z\\ket{+} = \\frac{1}{\\sqrt{2}}Z\\ket{0} + \\frac{1}{\\sqrt{2}}Z\\ket{1} = \\frac{1}{\\sqrt{2}}\\ket{0} - \\frac{1}{\\sqrt{2}}\\ket{1} = \\ket{-}$$

Try it: press H, then Z, and watch the arrow swing from $\\ket{+}$ to $\\ket{-}$ around the vertical axis.` },
      { t: 'widget', w: 'gate-lab', n: 1, gates: ['X', 'Y', 'Z', 'H', 'S', 'T'], caption: 'Each button is one rotation. You will meet every one of these gates properly in the next chapter.' },
      {
        t: 'code', title: 'See it in your framework',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from qiskit.visualization import plot_bloch_multivector

theta, phi = np.pi / 3, np.pi / 4
qc = QuantumCircuit(1)
qc.ry(theta, 0)   # tilt down from |0> by theta
qc.rz(phi, 0)     # turn around the z-axis by phi
plot_bloch_multivector(Statevector(qc))`,
        cirq: `import numpy as np
import cirq

theta, phi = np.pi / 3, np.pi / 4
q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.ry(theta)(q), cirq.rz(phi)(q))   # tilt by theta, turn by phi
state = cirq.final_state_vector(circuit)
print(cirq.bloch_vector_from_state_vector(state, 0))`,
      },
    ],
    quiz: { q: 'Where on the Bloch sphere is $\\frac{1}{\\sqrt{2}}\\ket{0} + \\frac{i}{\\sqrt{2}}\\ket{1}$?', options: ['The +x axis', 'The +y axis', 'The south pole', 'The centre'], answer: 1, why: 'θ = π/2 puts it on the equator, and $e^{i\\phi} = i$ gives φ = π/2 — a quarter-turn from +x, which is the +y axis.' },
    exercise: {
      prompt: `Complete ~bloch_point(theta, phi)~ so it returns the $(x, y, z)$ coordinates of the state. The starter already prints the points for $\\ket{-}$, $\\ket{+i}$ and a tilted state.`,
      starter: { both: `import math

def bloch_point(theta, phi):
    # TODO: return x, y, z using sin and cos of theta and phi
    return 0, 0, 0

for name, theta, phi in [("|->", math.pi / 2, math.pi), ("|+i>", math.pi / 2, math.pi / 2), ("tilted", math.pi / 3, math.pi / 4)]:
    x, y, z = bloch_point(theta, phi)
    print(f"{name:7} x = {x:5.2f}  y = {y:5.2f}  z = {z:5.2f}")` },
      solution: { both: `import math

def bloch_point(theta, phi):
    x = math.sin(theta) * math.cos(phi)
    y = math.sin(theta) * math.sin(phi)
    z = math.cos(theta)
    return x, y, z

for name, theta, phi in [("|->", math.pi / 2, math.pi), ("|+i>", math.pi / 2, math.pi / 2), ("tilted", math.pi / 3, math.pi / 4)]:
    x, y, z = bloch_point(theta, phi)
    print(f"{name:7} x = {x:5.2f}  y = {y:5.2f}  z = {z:5.2f}")` },
      check: [{ type: 'stdout', same: true }],
      hints: ['$z = \\cos\\theta$ — the height of the arrow.', '$x = \\sin\\theta\\cos\\phi$ and $y = \\sin\\theta\\sin\\phi$.', 'Use ~math.sin~ and ~math.cos~, and return all three: ~return x, y, z~.'],
    },
  },
  {
    id: 'rules', module: 'm0', title: 'The Rules of the Game', minutes: 18,
    blurb: 'Dirac notation, measuring in any basis, unitary gates and the no-cloning theorem.',
    blocks: [
      { t: 'md', v: `Quantum computing rests on a few rules. Quantum effects used in computation come down to four: **superposition**, **measurement**, **unitary evolution** and **entanglement**. This lesson gives you the notation and the first three; entanglement gets its own chapter.

### Kets and bras
A quantum state is a **ket**, written $\\ket{\\psi}$ — a column vector. Every ket has a partner **bra** $\\bra{\\psi}$: the row vector you get by transposing and taking complex conjugates.

$$\\ket{\\psi} = \\begin{pmatrix} a \\\\ b \\end{pmatrix} \\qquad \\bra{\\psi} = \\begin{pmatrix} \\bar{a} & \\bar{b} \\end{pmatrix}$$

A bra times a ket is the **inner product** — a single number:

$$\\braket{\\psi_1}{\\psi_2} = \\bar{a}c + \\bar{b}d \\quad\\text{for}\\quad \\ket{\\psi_1} = \\begin{pmatrix} a \\\\ b \\end{pmatrix},\\ \\ket{\\psi_2} = \\begin{pmatrix} c \\\\ d \\end{pmatrix}$$

Swapping the order conjugates it: $\\braket{\\psi_2}{\\psi_1} = \\overline{\\braket{\\psi_1}{\\psi_2}}$.` },
      { t: 'md', v: `### Rule 1 — Superposition (and normalisation)
If $\\ket{\\psi_1}$ and $\\ket{\\psi_2}$ are possible states, so is

$$\\ket{\\psi} = c_1\\ket{\\psi_1} + c_2\\ket{\\psi_2}$$

where $c_1, c_2$ are complex **probability amplitudes**. A valid state must be **normalised**: $\\braket{\\psi}{\\psi} = |c_1|^2 + |c_2|^2 = 1$.

**Example.** Is $\\sqrt{\\frac{2}{3}}\\ket{0} + \\frac{i}{\\sqrt{3}}\\ket{1}$ normalised?

$$\\left|\\sqrt{\\tfrac{2}{3}}\\right|^2 + \\left|\\tfrac{i}{\\sqrt{3}}\\right|^2 = \\frac{2}{3} + \\frac{1}{3} = 1$$

Yes. Note that $|i|^2 = 1$: complex phases never change the size of an amplitude.

### Orthonormal bases
$\\ket{0} = \\begin{pmatrix} 1 \\\\ 0 \\end{pmatrix}$ and $\\ket{1} = \\begin{pmatrix} 0 \\\\ 1 \\end{pmatrix}$ form the **computational basis**: each has length 1 and $\\braket{0}{1} = 0$. Together they are *complete* — every state can be written in them — which is summed up by the **completeness relation**:

$$\\ket{0}\\bra{0} + \\ket{1}\\bra{1} = \\begin{pmatrix} 1 & 0 \\\\ 0 & 0 \\end{pmatrix} + \\begin{pmatrix} 0 & 0 \\\\ 0 & 1 \\end{pmatrix} = I$$` },
      { t: 'md', v: `### Rule 2 — Measurement
Measuring a qubit in a basis gives one of the basis states at random. The **Born rule**: the probability of each outcome is the squared size of its amplitude, and the qubit **collapses** to that outcome.

$$\\ket{\\psi} = c_1\\ket{\\psi_1} + c_2\\ket{\\psi_2} \\quad\\Rightarrow\\quad P(\\psi_1) = |c_1|^2,\\ P(\\psi_2) = |c_2|^2$$

Crucially, **you choose the basis** — the observer chooses the frame of reference. Any orthonormal pair works. The most common alternative is the **Hadamard basis**:

$$\\ket{+} = \\frac{1}{\\sqrt{2}}\\ket{0} + \\frac{1}{\\sqrt{2}}\\ket{1} \\qquad \\ket{-} = \\frac{1}{\\sqrt{2}}\\ket{0} - \\frac{1}{\\sqrt{2}}\\ket{1}$$

Adding and subtracting these gives the computational basis back: $\\ket{0} = \\frac{1}{\\sqrt{2}}\\ket{+} + \\frac{1}{\\sqrt{2}}\\ket{-}$ and $\\ket{1} = \\frac{1}{\\sqrt{2}}\\ket{+} - \\frac{1}{\\sqrt{2}}\\ket{-}$. So for any $\\ket{\\psi} = \\alpha\\ket{0} + \\beta\\ket{1}$:

$$\\ket{\\psi} = \\frac{\\alpha + \\beta}{\\sqrt{2}}\\ket{+} + \\frac{\\alpha - \\beta}{\\sqrt{2}}\\ket{-} \\quad\\Rightarrow\\quad P(+) = \\frac{|\\alpha + \\beta|^2}{2},\\ P(-) = \\frac{|\\alpha - \\beta|^2}{2}$$

On the Bloch sphere, every basis is simply an **axis**: computational is z, Hadamard is x.` },
      { t: 'widget', w: 'basis-lab' },
      { t: 'md', v: `**Example.** $\\ket{\\psi} = \\frac{1}{2}\\ket{0} + \\frac{\\sqrt{3}}{2}\\ket{1}$ is measured in the Hadamard basis. What's the probability of $\\ket{+}$?

$$P(+) = \\frac{|\\alpha + \\beta|^2}{2} = \\frac{\\left(\\frac{1 + \\sqrt{3}}{2}\\right)^2}{2} = \\frac{4 + 2\\sqrt{3}}{8} = \\frac{1}{2} + \\frac{\\sqrt{3}}{4} \\approx 0.933$$

In the computational basis the same state gives $\\ket{1}$ 75% of the time. Same state, different question, different odds.` },
      {
        t: 'code', title: 'Probabilities in two bases', both: `import math

alpha = 1 / 2
beta = math.sqrt(3) / 2

print(f"normalised: {abs(alpha) ** 2 + abs(beta) ** 2:.3f}")
print(f"computational  P(0) = {abs(alpha) ** 2:.3f}   P(1) = {abs(beta) ** 2:.3f}")
p_plus = abs(alpha + beta) ** 2 / 2
p_minus = abs(alpha - beta) ** 2 / 2
print(f"Hadamard       P(+) = {p_plus:.3f}   P(-) = {p_minus:.3f}")`,
      },
      {
        t: 'code', title: 'Measuring in the Hadamard basis, in code',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

theta = 2 * np.arccos(1 / 2)    # prepares (1/2)|0> + (√3/2)|1>
qc = QuantumCircuit(1, 1)
qc.ry(theta, 0)
qc.h(0)              # rotate the Hadamard basis onto the computational one
qc.measure(0, 0)     # outcome 0 now means |+>, outcome 1 means |->

counts = AerSimulator().run(qc, shots=2000).result().get_counts()
print("P(+) ≈", counts.get('0', 0) / 2000)`,
        cirq: `import numpy as np
import cirq

theta = 2 * np.arccos(1 / 2)    # prepares (1/2)|0> + (√3/2)|1>
q = cirq.LineQubit(0)
circuit = cirq.Circuit(
    cirq.ry(theta)(q),
    cirq.H(q),                   # rotate the Hadamard basis onto the computational one
    cirq.measure(q, key='m'),    # outcome 0 now means |+>, outcome 1 means |->
)
result = cirq.Simulator().run(circuit, repetitions=2000)
print("P(+) ≈", result.histogram(key='m')[0] / 2000)`,
      },
      { t: 'callout', kind: 'tip', v: 'Hardware can only measure in the computational basis. To measure in another basis, rotate first: an H before the measurement turns |+⟩/|−⟩ into |0⟩/|1⟩. You will meet H properly in the next chapter.' },
      { t: 'md', v: `### Rule 3 — Unitary evolution
Between measurements, a closed quantum system changes by a **unitary** operator $U$ — the complex cousin of an orthogonal matrix:

$$U U^\\dagger = U^\\dagger U = I$$

Unitaries preserve normalisation, so a valid state always stays valid: if $a_0\\ket{0} + b_0\\ket{1}$ has $|a_0|^2 + |b_0|^2 = 1$, then $U$ maps it to $a_1\\ket{0} + b_1\\ket{1}$ with $|a_1|^2 + |b_1|^2 = 1$. Every quantum gate is a unitary — and on the Bloch sphere, every single-qubit unitary is a rotation.

Measurable quantities (**observables**) are a different kind of matrix: **Hermitian**, $A = A^\\dagger$. Their eigenvalues are always real (they're the possible measurement results) and their eigenvectors form an orthonormal basis (the states you can collapse to). The Pauli Z matrix is an observable whose eigenvectors are $\\ket{0}$ and $\\ket{1}$, with eigenvalues $+1$ and $-1$.

### A consequence — no cloning
You might want a gate that copies any unknown state: $U(\\ket{\\psi}\\ket{0}) = \\ket{\\psi}\\ket{\\psi}$. **It can't exist.** If it copied $\\ket{0}$ and $\\ket{1}$ correctly, linearity would force

$$U(\\ket{+}\\ket{0}) = \\frac{1}{\\sqrt{2}}U(\\ket{00}) + \\frac{1}{\\sqrt{2}}U(\\ket{10}) = \\frac{1}{\\sqrt{2}}\\ket{00} + \\frac{1}{\\sqrt{2}}\\ket{11}$$

— an entangled state, not the copy $\\ket{+}\\ket{+}$. Contradiction. This **no-cloning theorem** is why quantum teleportation moves a state rather than copying it.` },
    ],
    quiz: { q: 'You prepare $\\ket{+}$ and measure it in the Hadamard basis. What happens?', options: ['50% + and 50% −', 'Always +', 'Always −', 'It depends on the global phase'], answer: 1, why: '$\\ket{+}$ is itself a Hadamard basis state, so $P(+) = 1$. Measured in the computational basis it would be a 50/50 coin flip — the basis you choose matters.' },
    exercise: {
      prompt: `For $\\ket{\\psi} = 0.6\\ket{0} + 0.8i\\ket{1}$, compute the four probabilities $P(0)$, $P(1)$, $P(+)$ and $P(-)$. The starter prints them — replace the zeros with the right formulas.`,
      starter: { both: `alpha = 0.6
beta = complex(0, 0.8)   # 0.8i

p0 = 0        # TODO: |alpha|^2
p1 = 0        # TODO: |beta|^2
p_plus = 0    # TODO: |alpha + beta|^2 / 2
p_minus = 0   # TODO: |alpha - beta|^2 / 2

print(f"P(0) = {p0:.3f}   P(1) = {p1:.3f}")
print(f"P(+) = {p_plus:.3f}   P(-) = {p_minus:.3f}")` },
      solution: { both: `alpha = 0.6
beta = complex(0, 0.8)   # 0.8i

p0 = abs(alpha) ** 2
p1 = abs(beta) ** 2
p_plus = abs(alpha + beta) ** 2 / 2
p_minus = abs(alpha - beta) ** 2 / 2

print(f"P(0) = {p0:.3f}   P(1) = {p1:.3f}")
print(f"P(+) = {p_plus:.3f}   P(-) = {p_minus:.3f}")` },
      check: [{ type: 'stdout', same: true }],
      hints: ['~abs(z)~ gives the size of a complex number, and ~** 2~ squares it.', '$P(+) = \\frac{|\\alpha + \\beta|^2}{2}$ — add the amplitudes first, then take the size.', 'Notice anything about $P(+)$ and $P(-)$? The phase $i$ puts this state on the y–z plane, exactly between $\\ket{+}$ and $\\ket{-}$.'],
    },
  },
  // ------------------------------------------------------------------ M1
  {
    id: 'x-gate', module: 'm1', title: 'The X Gate: Quantum NOT', minutes: 8,
    blurb: 'Your first gate — flip |0⟩ to |1⟩, and see it as a half-turn of the sphere.',
    blocks: [
      { t: 'md', v: `The **X gate** is the quantum version of NOT: it swaps the amplitudes of $\\ket{0}$ and $\\ket{1}$.

$$X\\ket{0} = \\ket{1} \\qquad X\\ket{1} = \\ket{0}$$

On the Bloch sphere, X is a **180° rotation around the x-axis** — click it a few times and watch the arrow swing over.` },
      { t: 'widget', w: 'gate-lab', n: 1, gates: ['X'] },
      {
        t: 'code', title: 'Apply X and inspect the state',
        qiskit: `from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(1)
qc.x(0)          # flip qubit 0

state = Statevector(qc)
print(state)
print(state.probabilities_dict())`,
        cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.X(q))   # flip q
print(circuit)

result = cirq.Simulator().simulate(circuit)
print(result.final_state_vector)
print(result.dirac_notation())`,
      },
      { t: 'md', qiskit: `~Statevector(qc)~ computes the exact amplitudes — it's the simulator "peeking" at the state, something real hardware can never do. You'll see ~[0.+0.j, 1.+0.j]~: amplitude 0 for $\\ket{0}$ and 1 for $\\ket{1}$.`, cirq: `~Simulator().simulate(...)~ computes the exact amplitudes — the simulator "peeking" at the state, something real hardware can never do. ~final_state_vector~ lists the amplitudes for $\\ket{0}$ and $\\ket{1}$.` },
      { t: 'callout', kind: 'warn', qiskit: `Common mistake: ~qc.X(0)~ or ~qc.not(0)~. Qiskit gate methods are lowercase: ~qc.x(0)~. Try it in the editor to see how QProg flags it.`, cirq: `Common mistake: ~cirq.X(0)~. Cirq gates need a *qubit object*, not a number. Try it in the editor to see the error.` },
    ],
    quiz: { q: 'What is the state after applying X three times to $\\ket{0}$?', options: ['$\\ket{0}$', '$\\ket{1}$', 'An equal superposition', 'It depends on chance'], answer: 1, why: 'X X = identity, so X X X = X. One net flip: $\\ket{1}$.' },
    exercise: {
      prompt: 'Build a 1-qubit circuit that applies the **X gate three times**. Predict the final state first — then check it.',
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
# TODO: apply X three times
`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
# TODO: append X three times
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
qc.x(0)
qc.x(0)
qc.x(0)`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
circuit.append([cirq.X(q), cirq.X(q), cirq.X(q)])` },
      check: [{ type: 'state' }, { type: 'custom', fn: (u) => (u.view.ops.filter(o => o.name === 'x').length === 3 ? null : { msg: `Use exactly three X gates (you have ${u.view.ops.filter(o => o.name === 'x').length}).` }) }],
      hints: { qiskit: ['~qc.x(0)~ applies X to qubit 0.', 'Write it three times (or loop ~for _ in range(3):~).'], cirq: ['~circuit.append(cirq.X(q))~ adds one X.', 'You can append a list: ~circuit.append([cirq.X(q)] * 3)~.'] },
    },
  },
  {
    id: 'measurement', module: 'm1', title: 'Measurement, Shots & Counts', minutes: 12,
    blurb: 'Reading a qubit collapses it. Why we run circuits thousands of times.',
    blocks: [
      { t: 'md', v: `You can never read amplitudes directly. **Measuring** a qubit gives a single classical bit — 0 or 1 — at random, with probabilities $|\\alpha|^2$ and $|\\beta|^2$. Worse (or better!), the qubit **collapses** to the state you saw.

So to learn the probabilities, we **run the circuit many times** — each run is called a **shot** — and count the outcomes. Try it: set an angle, then measure once, a hundred, a thousand times.` },
      { t: 'widget', w: 'measure-lab' },
      {
        t: 'code', title: 'Measure and run 1000 shots',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(1, 1)    # 1 qubit, 1 classical bit
qc.x(0)
qc.measure(0, 0)             # qubit 0 -> classical bit 0

sim = AerSimulator()
job = sim.run(qc, shots=1000)
counts = job.result().get_counts()
print(counts)`,
        cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit(
    cirq.X(q),
    cirq.measure(q, key='m'),   # key names the result
)

sim = cirq.Simulator()
result = sim.run(circuit, repetitions=1000)
print(result.histogram(key='m'))`,
      },
      { t: 'md', qiskit: `**Anatomy:** ~QuantumCircuit(1, 1)~ creates 1 qubit *and* 1 classical bit to store the result. ~qc.measure(q, c)~ copies qubit q into classical bit c. The simulator returns a **Result**, and ~get_counts()~ gives a dictionary like ~{'1': 1000}~.

Shortcut: ~qc.measure_all()~ adds classical bits and measures everything in one go.`, cirq: `**Anatomy:** ~cirq.measure(q, key='m')~ is an operation that records q under the name ~'m'~. ~Simulator().run(..., repetitions=1000)~ returns a **Result**; ~result.histogram(key='m')~ counts outcomes as integers — here ~Counter({1: 1000})~.

Without ~key=~, Cirq names the key after the qubits, e.g. ~'q(0)'~ — a classic source of ~KeyError~s.` },
      { t: 'callout', kind: 'warn', qiskit: `Try deleting the ~1~ in ~QuantumCircuit(1, 1)~. Measuring needs somewhere to put the answer — QProg will show you exactly why it fails.`, cirq: `Try removing the measurement and running again: ~run()~ needs something to sample. QProg will show the error and explain the ~simulate()~ alternative.` },
    ],
    quiz: { q: 'A circuit puts a qubit into 50% $\\ket{0}$, 50% $\\ket{1}$. You run 1000 shots. Which result is most realistic?', options: ["{'0': 500, '1': 500} every time", "{'0': 489, '1': 511}", "{'0': 1000}", "{'1': 1000}"], answer: 1, why: 'Shots are random samples, so counts fluctuate around 500 — they are rarely exactly equal.' },
    exercise: {
      prompt: { qiskit: 'Prepare $\\ket{1}$, measure it, and run it with **exactly 500 shots**. Print the counts.', cirq: 'Prepare $\\ket{1}$, measure it with key ~\'result\'~, and run it with **exactly 500 repetitions**. Print the histogram.' },
      starter: { qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(1, 1)
# TODO: flip the qubit, measure it

sim = AerSimulator()
# TODO: run with 500 shots and print the counts
`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
# TODO: flip q, then measure with key='result'

sim = cirq.Simulator()
# TODO: run 500 repetitions and print the histogram
` },
      solution: { qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(1, 1)
qc.x(0)
qc.measure(0, 0)

sim = AerSimulator()
counts = sim.run(qc, shots=500).result().get_counts()
print(counts)`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
circuit.append([cirq.X(q), cirq.measure(q, key='result')])

sim = cirq.Simulator()
result = sim.run(circuit, repetitions=500)
print(result.histogram(key='result'))` },
      check: [{ type: 'measured' }, { type: 'dist' }, { type: 'ran', shots: 500 }, { type: 'stdout', lines: 1, msg: 'Print the counts so you can see them.' }],
      hints: { qiskit: ['~qc.x(0)~ then ~qc.measure(0, 0)~.', '~sim.run(qc, shots=500)~ returns a job; call ~.result().get_counts()~.'], cirq: ["~cirq.measure(q, key='result')~", '~sim.run(circuit, repetitions=500)~, then ~result.histogram(key=\'result\')~.'] },
    },
  },
  {
    id: 'superposition', module: 'm1', title: 'Superposition & the Hadamard Gate', minutes: 12,
    blurb: 'H puts a qubit "between" 0 and 1 — and you can undo it.',
    blocks: [
      { t: 'md', v: `The **Hadamard gate (H)** is the gateway to quantum behaviour:

$$H\\ket{0} = \\frac{\\ket{0} + \\ket{1}}{\\sqrt{2}} = \\ket{+}$$
$$H\\ket{1} = \\frac{\\ket{0} - \\ket{1}}{\\sqrt{2}} = \\ket{-}$$

Both give a 50/50 coin flip when measured — the amplitudes are $\\frac{1}{\\sqrt{2}} \\approx 0.707$, and $0.707^2 = 0.5$. But $\\ket{+}$ and $\\ket{-}$ are **different states**: they differ by a minus sign (a *phase*). Apply H again and they turn back into $\\ket{0}$ and $\\ket{1}$ — perfectly, every time. A random coin can't do that!

On the sphere, H is a half-turn about the diagonal axis between x and z. Try **H, H** and **X, H** below.` },
      { t: 'widget', w: 'gate-lab', n: 1, gates: ['H', 'X', 'Z'] },
      {
        t: 'code', title: 'A perfect quantum coin',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(1)
qc.h(0)
print(Statevector(qc))      # amplitudes 0.707, 0.707

qc.measure_all()
counts = AerSimulator().run(qc, shots=1000).result().get_counts()
print(counts)`,
        cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.H(q))
print(cirq.Simulator().simulate(circuit).dirac_notation())

circuit.append(cirq.measure(q, key='coin'))
result = cirq.Simulator().run(circuit, repetitions=1000)
print(result.histogram(key='coin'))`,
      },
      { t: 'callout', kind: 'tip', v: 'Step through the circuit with the ▶ control under the diagram. The Bloch sphere animates each gate as the exact rotation it performs.' },
    ],
    quiz: { q: 'What does $HH\\ket{0}$ give?', options: ['$\\ket{0}$', '$\\ket{1}$', '$\\ket{+}$', 'A random result'], answer: 0, why: 'H is its own inverse (H H = I). The two "paths" to $\\ket{1}$ cancel out — interference!' },
    exercise: {
      prompt: 'Prepare the state $\\ket{-} = \\frac{\\ket{0} - \\ket{1}}{\\sqrt{2}}$ on a single qubit. (Hint: which basis state does H turn into $\\ket{-}$?)',
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
# TODO: prepare |−⟩
`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
# TODO: prepare |−⟩
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
qc.x(0)
qc.h(0)`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit([cirq.X(q), cirq.H(q)])` },
      check: [{ type: 'state' }],
      hints: ['$H\\ket{1} = \\ket{-}$. So first get to $\\ket{1}$…', 'X then H. Order matters!'],
    },
  },
  {
    id: 'phase', module: 'm1', title: 'Phase: Z, S and T', minutes: 14,
    blurb: 'The invisible quantity that makes interference — and algorithms — work.',
    blocks: [
      { t: 'md', v: `**Z** leaves $\\ket{0}$ alone and multiplies $\\ket{1}$ by $-1$. Measured on its own, Z changes *nothing* — probabilities stay the same. So why care?

Because phase shows up when paths **interfere**. Sandwich Z between two Hadamards and you get a full bit flip:

$$HZH = X$$

On the Bloch sphere, Z is a half-turn around the vertical z-axis. **S** is a quarter-turn (90°) and **T** an eighth-turn (45°) — in fact $S^2 = Z$ and $T^2 = S$. They move the arrow *around the equator* — changing the phase but not the height (the probabilities).` },
      { t: 'widget', w: 'gate-lab', n: 1, gates: ['H', 'Z', 'S', 'S†', 'T'], caption: 'Press H, then S four times — the arrow walks around the equator and comes home. Probabilities never move!' },
      {
        t: 'code', title: 'Same probabilities, different states',
        qiskit: `from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

plus = QuantumCircuit(1)
plus.h(0)

minus = QuantumCircuit(1)
minus.h(0)
minus.z(0)

print(Statevector(plus).probabilities_dict())
print(Statevector(minus).probabilities_dict())

# Interference reveals the phase:
plus.h(0)
minus.h(0)
print("H Z H:", Statevector(minus).probabilities_dict())`,
        cirq: `import cirq

q = cirq.LineQubit(0)
sim = cirq.Simulator()

plus = cirq.Circuit(cirq.H(q))
minus = cirq.Circuit(cirq.H(q), cirq.Z(q))
print(sim.simulate(plus).dirac_notation())
print(sim.simulate(minus).dirac_notation())

# Interference reveals the phase:
hzh = cirq.Circuit(cirq.H(q), cirq.Z(q), cirq.H(q))
print("H Z H:", sim.simulate(hzh).dirac_notation())`,
      },
      { t: 'md', qiskit: `Qiskit names: ~qc.z~, ~qc.s~, ~qc.sdg~ (S-dagger, the inverse), ~qc.t~, ~qc.tdg~, and the general phase gate ~qc.p(θ, q)~.`, cirq: `Cirq names: ~cirq.Z~, ~cirq.S~, ~cirq.T~. Cirq treats them as powers of Z — S is ~cirq.Z**0.5~, T is ~cirq.Z**0.25~ — and ~cirq.S**-1~ is the inverse.` },
    ],
    quiz: { q: 'Which gate changes the measurement probabilities of $\\ket{+}$?', options: ['Z', 'S', 'T', 'H'], answer: 3, why: 'Z, S and T only rotate around the z-axis (phase). H rotates $\\ket{+}$ to $\\ket{0}$, so probabilities change from 50/50 to 100/0.' },
    exercise: {
      prompt: 'Make $\\ket{0}$ into **$\\ket{1}$ using only H and Z gates** (no X allowed).',
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
# TODO: only qc.h and qc.z allowed
`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit()
# TODO: only cirq.H and cirq.Z allowed
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
qc.h(0)
qc.z(0)
qc.h(0)`, cirq: `import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit([cirq.H(q), cirq.Z(q), cirq.H(q)])` },
      check: [{ type: 'only', ops: ['h', 'z'] }, { type: 'state' }],
      hints: ['H Z H behaves exactly like X.', 'H, then Z, then H.'],
    },
  },
  {
    id: 'rotations', module: 'm1', title: 'Rotations: Any Probability You Like', minutes: 14,
    blurb: 'RX, RY and RZ turn the sphere by any angle — dial in exact probabilities.',
    blocks: [
      { t: 'md', v: `X, Y, Z and H are fixed half-turns. **Rotation gates** take an angle $\\theta$ (in radians):

- $R_X(\\theta)$ rotates around x, $R_Y(\\theta)$ around y, $R_Z(\\theta)$ around z.

$$R_Y(\\theta)\\ket{0} = \\cos\\frac{\\theta}{2}\\ket{0} + \\sin\\frac{\\theta}{2}\\ket{1}$$

So $P(1) = \\sin^2\\left(\\frac{\\theta}{2}\\right)$. Want a 25% chance of 1? Solve $\\sin^2\\left(\\frac{\\theta}{2}\\right) = 0.25$, giving $\\theta = 2\\arcsin\\sqrt{0.25} = \\frac{\\pi}{3}$.

Radians: $\\pi \\approx 3.14159$ is a half-turn. Use ~np.pi~ after ~import numpy as np~.` },
      { t: 'widget', w: 'measure-lab' },
      {
        t: 'code', title: 'Dial in a probability',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

p_one = 0.75                          # target P(1)
theta = 2 * np.arcsin(np.sqrt(p_one))

qc = QuantumCircuit(1)
qc.ry(theta, 0)                       # angle FIRST, then qubit
print(f"theta = {theta:.4f} rad")
print(Statevector(qc).probabilities_dict())`,
        cirq: `import numpy as np
import cirq

p_one = 0.75                          # target P(1)
theta = 2 * np.arcsin(np.sqrt(p_one))

q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.ry(theta)(q))   # make the gate, then apply it
print(f"theta = {theta:.4f} rad")
print(circuit)
state = cirq.final_state_vector(circuit)
print(np.round(np.abs(state) ** 2, 3))`,
      },
      { t: 'callout', kind: 'warn', qiskit: 'Argument order trips everyone up: Qiskit writes the **angle first** — ~qc.ry(theta, 0)~. Try swapping them to see QProg\'s explanation.', cirq: 'In Cirq, ~cirq.ry(theta)~ *creates a gate*; a second pair of brackets applies it: ~cirq.ry(theta)(q)~. Try ~cirq.ry(q)~ to see what happens.' },
    ],
    quiz: { q: '$R_Y(\\pi)\\ket{0}$ equals…', options: ['$\\ket{0}$', '$\\ket{1}$', '$\\ket{+}$', '$\\ket{-}$'], answer: 1, why: '$\\cos\\left(\\frac{\\pi}{2}\\right) = 0$ and $\\sin\\left(\\frac{\\pi}{2}\\right) = 1$, so $R_Y(\\pi)$ takes the north pole all the way to the south pole.' },
    exercise: {
      prompt: 'Using a **single RY gate**, prepare a qubit with exactly a **25% chance** of measuring 1.',
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
# TODO: choose theta so that P(1) = 0.25
`, cirq: `import numpy as np
import cirq

q = cirq.LineQubit(0)
# TODO: choose theta so that P(1) = 0.25
circuit = cirq.Circuit()
` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

qc = QuantumCircuit(1)
qc.ry(np.pi / 3, 0)`, cirq: `import numpy as np
import cirq

q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.ry(np.pi / 3)(q))` },
      check: [{ type: 'uses', ops: ['ry'], msg: 'Use an RY gate for this one.' }, {
        type: 'custom', fn: (u) => {
          const st = u.sim?.final; if (!st) return { msg: 'No state yet.' };
          const p1 = 1 - (st.re[0] ** 2 + st.im[0] ** 2);
          return Math.abs(p1 - 0.25) < 0.005 ? null : { msg: `Your P(1) is ${(p1 * 100).toFixed(1)}% — aim for 25%. Remember P(1) = sin²(θ/2).`, line: u.view.ops.find(o => o.name === 'ry')?.span?.line };
        },
      }],
      hints: ['$P(1) = \\sin^2\\left(\\frac{\\theta}{2}\\right) = 0.25$, so $\\sin\\left(\\frac{\\theta}{2}\\right) = 0.5$.', '$\\frac{\\theta}{2} = \\frac{\\pi}{6}$, so $\\theta = \\frac{\\pi}{3}$.', ['Qiskit: ~qc.ry(np.pi / 3, 0)~', 'Cirq: ~cirq.ry(np.pi / 3)(q)~'].join(' · ')],
    },
  },
  // ------------------------------------------------------------------ M2
  {
    id: 'multi-qubit', module: 'm2', title: 'Many Qubits & Bit Ordering', minutes: 14,
    blurb: 'n qubits = 2ⁿ amplitudes. And the #1 gotcha when switching frameworks.',
    blocks: [
      { t: 'md', v: `Two qubits have **four** basis states — $\\ket{00}, \\ket{01}, \\ket{10}, \\ket{11}$ — and a general 2-qubit state needs four amplitudes. Three qubits need 8, and $n$ qubits need $2^n$. Fifty qubits would need over a quadrillion numbers: that's why simulating quantum computers is hard, and why building them is exciting.

### Which bit is which?
When a result says ~01~, which qubit is the 1? **The two frameworks disagree:**

- **Qiskit** is *little-endian*: qubit 0 is the **rightmost** character. ~'01'~ means q1 = 0, q0 = 1.
- **Cirq** is *big-endian*: the first qubit is the **leftmost** character. ~01~ means q0 = 0, q1 = 1.

Same physics, different spelling. The bars in the visualiser always use your current framework's convention.` },
      { t: 'widget', w: 'gate-lab', n: 2, gates: ['X', 'H'] },
      {
        t: 'code', title: 'Flip only qubit 0',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2)
qc.x(0)            # flip ONLY qubit 0
qc.measure_all()

counts = AerSimulator().run(qc, shots=100).result().get_counts()
print(counts)      # {'01': 100}  <- qubit 0 is on the RIGHT`,
        cirq: `import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit(
    cirq.X(q0),                      # flip ONLY q0
    cirq.measure(q0, q1, key='m'),
)
result = cirq.Simulator().run(circuit, repetitions=100)
print(result)                        # per-qubit records
print(result.histogram(key='m'))     # Counter({2: 100}) -> 2 = 0b10, q0 on the LEFT`,
      },
    ],
    quiz: { q: { qiskit: "In Qiskit, a 3-qubit result '100' means…", cirq: 'In Cirq, a 3-qubit result 100 (from measure(q0, q1, q2)) means…' }, options: { qiskit: ['q0 = 1', 'q2 = 1', 'q1 = 1', 'all qubits are 1'], cirq: ['q0 = 1', 'q2 = 1', 'q1 = 1', 'all qubits are 1'] }, answer: { qiskit: 1, cirq: 0 }, why: { qiskit: 'Qiskit reads right-to-left: the leftmost character is the highest qubit, q2.', cirq: 'Cirq reads left-to-right in measurement order: the first character is q0.' } },
    exercise: {
      prompt: { qiskit: "Build a 3-qubit circuit whose measurement **always** gives the Qiskit bitstring ~'110'~.", cirq: 'Build a 3-qubit circuit (qubits from ~LineQubit.range(3)~) whose measurement **always** gives the Cirq bitstring ~110~ (i.e. in q0 q1 q2 order).' },
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(3)
# TODO: flip the right qubits so the result reads '110'
qc.measure_all()`, cirq: `import cirq

q = cirq.LineQubit.range(3)
circuit = cirq.Circuit()
# TODO: flip the right qubits so the result reads 110
circuit.append(cirq.measure(*q, key='m'))` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(3)
qc.x(1)
qc.x(2)
qc.measure_all()`, cirq: `import cirq

q = cirq.LineQubit.range(3)
circuit = cirq.Circuit()
circuit.append([cirq.X(q[0]), cirq.X(q[1])])
circuit.append(cirq.measure(*q, key='m'))` },
      check: [{ type: 'qubits', n: 3 }, { type: 'state' }],
      hints: { qiskit: ['Qiskit reads right-to-left: \'110\' → q2=1, q1=1, q0=0.', 'Flip qubits 1 and 2.'], cirq: ['Cirq reads left-to-right: 110 → q0=1, q1=1, q2=0.', 'Flip q[0] and q[1].'] },
    },
  },
  {
    id: 'cnot', module: 'm2', title: 'Controlled Gates & CNOT', minutes: 12,
    blurb: 'If-this-then-that, the quantum way.',
    blocks: [
      { t: 'md', v: `The **CNOT** (controlled-NOT, ~CX~) acts on two qubits: a **control** and a **target**. If the control is $\\ket{1}$, it flips the target; otherwise it does nothing.

| control | target | → | control | target |
|---|---|---|---|---|
| 0 | 0 | | 0 | 0 |
| 0 | 1 | | 0 | 1 |
| 1 | 0 | | 1 | **1** |
| 1 | 1 | | 1 | **0** |

In diagrams the control is a dot ● and the target a ⊕. Other controlled gates work the same way — **CZ** applies Z when the control is 1, and **Toffoli (CCX)** needs *two* controls.` },
      { t: 'widget', w: 'gate-lab', n: 2, gates: ['X'], cnot: true, caption: 'Flip qubit 0 with X, then apply CNOT 0→1: the target follows the control.' },
      {
        t: 'code', title: 'CNOT truth table, computed',
        qiskit: `from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

for c in [0, 1]:
    for t in [0, 1]:
        qc = QuantumCircuit(2)
        if c:
            qc.x(0)          # control = qubit 0
        if t:
            qc.x(1)          # target  = qubit 1
        qc.cx(0, 1)          # cx(control, target)
        out = Statevector(qc).probabilities_dict()
        print(f"control={c} target={t} -> {list(out)[0]}  (q1 q0)")`,
        cirq: `import cirq

ctrl, tgt = cirq.LineQubit.range(2)
sim = cirq.Simulator()
for c in [0, 1]:
    for t in [0, 1]:
        ops = []
        if c:
            ops.append(cirq.X(ctrl))
        if t:
            ops.append(cirq.X(tgt))
        ops.append(cirq.CNOT(ctrl, tgt))      # CNOT(control, target)
        ops.append(cirq.measure(ctrl, tgt, key='m'))
        r = sim.run(cirq.Circuit(ops), repetitions=1)
        print(f"control={c} target={t} ->", r.measurements['m'][0])`,
      },
    ],
    quiz: { q: 'Starting from $\\ket{00}$ you apply CNOT(control=0, target=1). What changes?', options: ['Qubit 1 flips', 'Qubit 0 flips', 'Nothing', 'Both flip'], answer: 2, why: 'The control is $\\ket{0}$, so CNOT does nothing.' },
    exercise: {
      prompt: 'Starting from all zeros, reach the state where **both qubits are 1**, using **exactly one X and one CNOT**.',
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
# TODO: one X, one CNOT
`, cirq: `import cirq

a, b = cirq.LineQubit.range(2)
circuit = cirq.Circuit()
# TODO: one X, one CNOT
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
qc.x(0)
qc.cx(0, 1)`, cirq: `import cirq

a, b = cirq.LineQubit.range(2)
circuit = cirq.Circuit([cirq.X(a), cirq.CNOT(a, b)])` },
      check: [{ type: 'only', ops: ['x', 'cx'] }, { type: 'custom', fn: (u) => u.view.ops.length === 2 ? null : { msg: `Use exactly two gates (you have ${u.view.ops.length}).` } }, { type: 'custom', fn: (u) => { const st = u.sim?.final; return st && st.re[3] ** 2 + st.im[3] ** 2 > 0.999 ? null : { msg: 'Both qubits should end up as 1.', line: u.view.ops[u.view.ops.length - 1]?.span?.line }; } }],
      hints: ['Flip one qubit to 1 with X…', '…then use it as the control of a CNOT targeting the other.'],
    },
  },
  {
    id: 'bell', module: 'm2', title: 'Entanglement & Bell States', minutes: 15,
    blurb: 'Two qubits, one shared fate. The resource behind teleportation and more.',
    blocks: [
      { t: 'md', v: `Put qubit 0 in superposition with **H**, then use it to control a **CNOT**:

$$\\ket{\\Phi^+} = \\frac{\\ket{00} + \\ket{11}}{\\sqrt{2}}$$

This is the **Bell state** $\\ket{\\Phi^+}$. Measure it and you get 00 or 11 — 50/50 — but **never 01 or 10**. The two results are perfectly correlated, even though each one on its own is random. The qubits are **entangled**: the pair has a definite state, but neither qubit does individually.

Watch the Bloch spheres as you build it below: after the CNOT **both arrows shrink to the centre**. A single entangled qubit has no direction of its own — its information lives in the *correlation*.` },
      { t: 'widget', w: 'gate-lab', n: 2, gates: ['H', 'X', 'Z'], cnot: true, caption: 'Try: H on q0, then CNOT 0→1. Then experiment: add X or Z to make the other three Bell states.' },
      {
        t: 'code', title: 'Build and sample a Bell pair',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])
print(qc)

counts = AerSimulator().run(qc, shots=1000).result().get_counts()
print(counts)          # only '00' and '11'!`,
        cirq: `import cirq

q0, q1 = cirq.LineQubit.range(2)
bell = cirq.Circuit(
    cirq.H(q0),
    cirq.CNOT(q0, q1),
    cirq.measure(q0, q1, key='bell'),
)
print(bell)

result = cirq.Simulator().run(bell, repetitions=1000)
print(result.histogram(key='bell'))   # only 0 (=00) and 3 (=11)!`,
      },
      { t: 'md', v: `### The four Bell states
Start from H + CNOT, then add:
- $\\ket{\\Phi^+} = \\frac{\\ket{00} + \\ket{11}}{\\sqrt{2}}$ — nothing extra
- $\\ket{\\Phi^-} = \\frac{\\ket{00} - \\ket{11}}{\\sqrt{2}}$ — Z on qubit 0
- $\\ket{\\Psi^+} = \\frac{\\ket{01} + \\ket{10}}{\\sqrt{2}}$ — X on qubit 1
- $\\ket{\\Psi^-} = \\frac{\\ket{01} - \\ket{10}}{\\sqrt{2}}$ — X on qubit 1, then Z on qubit 0` },
    ],
    quiz: { q: 'You measure qubit 0 of a Φ⁺ Bell pair and get 1. What will qubit 1 give?', options: ['0', '1', '50/50', 'Undefined'], answer: 1, why: 'Φ⁺ only contains $\\ket{00}$ and $\\ket{11}$, so the outcomes always agree.' },
    exercise: {
      prompt: 'Build the Bell state $\\ket{\\Psi^+} = \\frac{\\ket{01} + \\ket{10}}{\\sqrt{2}}$ — the "always disagree" pair.',
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
# TODO: build Ψ+
`, cirq: `import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit()
# TODO: build Ψ+
` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.x(1)`, cirq: `import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit([cirq.H(q0), cirq.CNOT(q0, q1), cirq.X(q1)])` },
      check: [{ type: 'state' }],
      hints: ['Start with the usual H + CNOT.', 'Then flip qubit 1 so 00→01 and 11→10.'],
    },
  },
  {
    id: 'ghz', module: 'm2', title: 'GHZ States & Building with Loops', minutes: 12,
    blurb: 'Entangle any number of qubits — and let Python write the circuit for you.',
    blocks: [
      { t: 'md', v: `The **GHZ state** extends a Bell pair to n qubits:

$$\\ket{\\mathrm{GHZ}} = \\frac{\\ket{00\\ldots0} + \\ket{11\\ldots1}}{\\sqrt{2}}$$

Recipe: H on the first qubit, then a **chain of CNOTs** from each qubit to the next. That's repetitive — exactly what loops are for. Real quantum programs are built this way: Python generates the circuit.` },
      {
        t: 'code', title: 'GHZ for any n',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

n = 3
qc = QuantumCircuit(n)
qc.h(0)
for i in range(n - 1):
    qc.cx(i, i + 1)
qc.measure_all()
print(qc)

counts = AerSimulator().run(qc, shots=1000).result().get_counts()
print(counts)`,
        cirq: `import cirq

n = 3
qs = cirq.LineQubit.range(n)
ghz = cirq.Circuit()
ghz.append(cirq.H(qs[0]))
for i in range(n - 1):
    ghz.append(cirq.CNOT(qs[i], qs[i + 1]))
ghz.append(cirq.measure(*qs, key='ghz'))
print(ghz)

result = cirq.Simulator().run(ghz, repetitions=1000)
print(result.histogram(key='ghz'))`,
      },
      { t: 'callout', kind: 'tip', v: 'Change n to 5 and watch the circuit, the Bloch spheres and the probability bars all update live.' },
    ],
    quiz: { q: 'How many different outcomes can a perfect 5-qubit GHZ state produce?', options: ['2', '5', '10', '32'], answer: 0, why: 'Only 00000 and 11111 — no matter how many qubits.' },
    exercise: {
      prompt: { qiskit: 'Build a **4-qubit GHZ** state **using a loop**, measure all qubits, and run 1000 shots. Print the counts.', cirq: 'Build a **4-qubit GHZ** state **using a loop**, measure all qubits (key ~\'ghz\'~), and run 1000 repetitions. Print the histogram.' },
      starter: { qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

n = 4
qc = QuantumCircuit(n)
# TODO: H, then a loop of CNOTs, then measure_all

# TODO: run 1000 shots and print the counts
`, cirq: `import cirq

n = 4
qs = cirq.LineQubit.range(n)
circuit = cirq.Circuit()
# TODO: H, then a loop of CNOTs, then measure with key='ghz'

# TODO: run 1000 repetitions and print the histogram
` },
      solution: { qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

n = 4
qc = QuantumCircuit(n)
qc.h(0)
for i in range(n - 1):
    qc.cx(i, i + 1)
qc.measure_all()

counts = AerSimulator().run(qc, shots=1000).result().get_counts()
print(counts)`, cirq: `import cirq

n = 4
qs = cirq.LineQubit.range(n)
circuit = cirq.Circuit()
circuit.append(cirq.H(qs[0]))
for i in range(n - 1):
    circuit.append(cirq.CNOT(qs[i], qs[i + 1]))
circuit.append(cirq.measure(*qs, key='ghz'))

result = cirq.Simulator().run(circuit, repetitions=1000)
print(result.histogram(key='ghz'))` },
      check: [{ type: 'qubits', n: 4 }, { type: 'state' }, { type: 'measured' }, { type: 'ran', shots: 1000 }, { type: 'code', regex: '\\bfor\\b', msg: 'Use a for-loop to add the CNOTs.' }],
      hints: ['~for i in range(n - 1):~ visits pairs (0,1), (1,2), (2,3).', 'Inside the loop: CNOT from qubit i to qubit i + 1.'],
    },
  },
  // ------------------------------------------------------------------ M3
  {
    id: 'statevector', module: 'm3', title: 'Statevectors: Peeking Inside', minutes: 12,
    blurb: 'Exact amplitudes vs. sampled shots — and when to use which.',
    blocks: [
      { t: 'md', v: `Simulators can do something real hardware can't: give you the **exact state** — every amplitude. This is perfect for learning and debugging.

| | Exact state | Sampled shots |
|---|---|---|
| What you get | All 2ⁿ amplitudes | Counts of outcomes |
| Randomness | None | Shot noise |
| Real hardware? | Impossible | Yes |
| Needs measurement? | Must **not** contain measurement | Must contain measurement |` },
      {
        t: 'code', title: 'Two views of the same state',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.ry(np.pi / 2, 1)

sv = Statevector(qc)
print(sv)
print(sv.probabilities_dict())

# Sampling from the exact state - like running shots:
print(sv.sample_counts(1000))`,
        cirq: `import numpy as np
import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit(cirq.H(q0), cirq.CNOT(q0, q1), cirq.ry(np.pi / 2)(q1))

result = cirq.Simulator().simulate(circuit)
print(result)
state = result.final_state_vector
print("Probabilities:", np.round(np.abs(state) ** 2, 3))
print("Dirac:", cirq.dirac_notation(state))`,
      },
      { t: 'callout', kind: 'warn', qiskit: 'Add ~qc.measure_all()~ before ~Statevector(qc)~ and see what happens — measurement isn\'t a reversible operation, so there is no single statevector after it.', cirq: 'Cirq\'s ~simulate()~ also accepts circuits with measurements — but then the state is *collapsed* to one random outcome. Try adding ~cirq.measure(q0)~ and re-running a few times.' },
    ],
    quiz: { q: 'Which of these can real quantum hardware give you directly?', options: ['The full statevector', 'Measurement counts', 'The amplitudes of $\\ket{00}$', 'The phase of each amplitude'], answer: 1, why: 'Hardware only ever returns measurement outcomes. Everything else must be inferred from statistics.' },
    exercise: {
      prompt: { qiskit: 'Build: H on qubit 0, CNOT(0→1), then **RY(π/2) on qubit 1**. Print the **probabilities dictionary** of its statevector.', cirq: 'Build: H on q0, CNOT(q0→q1), then **RY(π/2) on q1**. Print the final state vector\'s **probabilities** (|amplitude|², rounded to 3 decimals).' },
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(2)
# TODO: build the circuit, then print the probabilities dict
`, cirq: `import numpy as np
import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit()
# TODO: build the circuit, then print the probabilities
` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.ry(np.pi / 2, 1)
print(Statevector(qc).probabilities_dict())`, cirq: `import numpy as np
import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit([cirq.H(q0), cirq.CNOT(q0, q1), cirq.ry(np.pi / 2)(q1)])
state = cirq.final_state_vector(circuit)
print(np.round(np.abs(state) ** 2, 3))` },
      check: [{ type: 'state' }, { type: 'stdout', lines: 1, msg: 'Print the probabilities.' }],
      hints: { qiskit: ['~qc.ry(np.pi / 2, 1)~ — angle first.', '~Statevector(qc).probabilities_dict()~'], cirq: ['~cirq.ry(np.pi / 2)(q1)~', '~np.abs(state) ** 2~ gives probabilities.'] },
    },
  },
  {
    id: 'circuit-anatomy', module: 'm3', title: 'Circuits as Objects: Depth, Moments, Inverses', minutes: 14,
    blurb: 'Measure, combine and reverse circuits — and why "uncomputing" matters.',
    blocks: [
      { t: 'md', v: `Circuits are Python objects you can inspect and combine.

**Depth** is the number of time-steps when gates on different qubits run in parallel. Fewer steps = less time for noise to creep in, so depth matters on real hardware.` },
      { t: 'md', qiskit: `Qiskit: ~qc.depth()~, ~qc.size()~ (gate count), ~qc.count_ops()~, ~qc.inverse()~ (reverse + undo every gate), ~qc.compose(other)~ (append another circuit).`, cirq: `Cirq organises circuits into **Moments** — slices of operations that happen at the same time. ~len(circuit)~ is the depth. When you ~append~, Cirq slides each operation into the **earliest** moment where its qubits are free. ~cirq.inverse(circuit)~ reverses it and ~circuit1 + circuit2~ joins circuits.` },
      {
        t: 'code', title: 'Inspect, invert, uncompute',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

u = QuantumCircuit(3)
u.h(0)
u.h(1)
u.cx(0, 2)
u.ry(np.pi / 3, 1)
u.t(2)
print(u)
print("depth:", u.depth(), " size:", u.size())
print(u.count_ops())

full = u.compose(u.inverse())     # U followed by U-dagger
print(Statevector(full).probabilities_dict())   # back to |000>`,
        cirq: `import numpy as np
import cirq

a, b, c = cirq.LineQubit.range(3)
u = cirq.Circuit()
u.append([cirq.H(a), cirq.H(b), cirq.CNOT(a, c), cirq.ry(np.pi / 3)(b), cirq.T(c)])
print(u)
print("moments (depth):", len(u))

full = u + cirq.inverse(u)        # U followed by U-dagger
state = cirq.final_state_vector(full)
print(cirq.dirac_notation(state))    # back to |000>`,
      },
      { t: 'callout', kind: 'tip', v: 'Every gate is reversible, so any circuit without measurements can be undone. Algorithms use this to "uncompute" scratch qubits back to $\\ket{0}$.' },
    ],
    quiz: { q: 'What is the inverse of a T gate?', options: ['T', 'S', 'T† (T-dagger)', 'There isn\'t one'], answer: 2, why: 'T rotates +45° about z; T† rotates −45°. Every unitary gate has an inverse.' },
    exercise: {
      prompt: 'The starter builds a scrambling circuit ~u~. Create a circuit that runs **u and then its inverse**, returning all three qubits to $\\ket{000}$.',
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

u = QuantumCircuit(3)
u.h(0)
u.cx(0, 1)
u.rx(np.pi / 5, 2)
u.cz(1, 2)
u.s(0)

# TODO: full = u followed by its inverse
`, cirq: `import numpy as np
import cirq

a, b, c = cirq.LineQubit.range(3)
u = cirq.Circuit([cirq.H(a), cirq.CNOT(a, b), cirq.rx(np.pi / 5)(c), cirq.CZ(b, c), cirq.S(a)])

# TODO: full = u followed by its inverse
` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

u = QuantumCircuit(3)
u.h(0)
u.cx(0, 1)
u.rx(np.pi / 5, 2)
u.cz(1, 2)
u.s(0)

full = u.compose(u.inverse())`, cirq: `import numpy as np
import cirq

a, b, c = cirq.LineQubit.range(3)
u = cirq.Circuit([cirq.H(a), cirq.CNOT(a, b), cirq.rx(np.pi / 5)(c), cirq.CZ(b, c), cirq.S(a)])

full = u + cirq.inverse(u)` },
      check: [{ type: 'state' }, { type: 'custom', fn: (u) => u.view.ops.length >= 10 ? null : { msg: 'The final circuit should contain u (5 gates) AND its inverse (5 more).' } }],
      hints: { qiskit: ['~u.inverse()~ returns a new reversed circuit.', '~u.compose(other)~ returns u followed by other.'], cirq: ['~cirq.inverse(u)~ returns the reversed circuit.', 'Join circuits with ~+~.'] },
    },
  },
  // ------------------------------------------------------------------ M4
  {
    id: 'deutsch-jozsa', module: 'm4', title: 'Phase Kickback & Deutsch–Jozsa', minutes: 18,
    blurb: 'Your first quantum speed-up: decide "constant or balanced" with ONE query.',
    blocks: [
      { t: 'md', v: `You're given a black-box function f on n bits that is promised to be either **constant** (same output for all inputs) or **balanced** (0 for exactly half the inputs). Classically you might need $2^{n-1} + 1$ queries to be sure. **Deutsch–Jozsa needs one.**

### The trick: phase kickback
Put an extra "ancilla" qubit in $\\ket{-}$. A CNOT targeting $\\ket{-}$ doesn't change the ancilla — instead it multiplies the *control's* $\\ket{1}$ amplitude by $-1$. The oracle's answer is **kicked back as a phase** onto the inputs.

### The recipe
1. Ancilla to $\\ket{1}$, then H on every qubit (inputs → $\\ket{+}$, ancilla → $\\ket{-}$).
2. Apply the oracle (CNOTs from inputs to ancilla encode f).
3. H on the inputs again, and measure them.
4. **All zeros ⇒ constant. Anything else ⇒ balanced.**

Interference makes all the "wrong" answers cancel.` },
      {
        t: 'code', title: 'Deutsch–Jozsa with a constant oracle',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

n = 2                     # input qubits 0..1, ancilla = qubit 2
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
qc.barrier()
# constant oracle f(x) = 0: do nothing
qc.barrier()
qc.h(range(n))
qc.measure(range(n), range(n))
print(qc)

counts = AerSimulator().run(qc, shots=500).result().get_counts()
print(counts, "-> constant" if list(counts) == ['00'] else "-> balanced")`,
        cirq: `import cirq

n = 2
inputs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)

circuit = cirq.Circuit()
circuit.append(cirq.X(anc))
circuit.append([cirq.H(q) for q in inputs + [anc]])
# constant oracle f(x) = 0: do nothing
circuit.append([cirq.H(q) for q in inputs])
circuit.append(cirq.measure(*inputs, key='x'))
print(circuit)

hist = cirq.Simulator().run(circuit, repetitions=500).histogram(key='x')
print(hist, "-> constant" if list(hist.keys()) == [0] else "-> balanced")`,
      },
      { t: 'md', qiskit: '~qc.h(range(n + 1))~ applies H to several qubits at once — Qiskit *broadcasts* gates over lists and ranges.', cirq: 'A list comprehension like ~[cirq.H(q) for q in qubits]~ builds many operations at once — or use ~cirq.H.on_each(qubits)~.' },
    ],
    quiz: { q: 'In Deutsch–Jozsa, the inputs measure as all zeros. The function is…', options: ['Balanced', 'Constant', 'Can\'t tell from one run', 'Random'], answer: 1, why: 'For a constant f the amplitudes interfere so that all-zeros has probability exactly 1.' },
    exercise: {
      prompt: 'Swap in a **balanced oracle**: f(x) = x₀ ⊕ x₁. Implement it with **a CNOT from each input qubit to the ancilla**. Measure the inputs — you should never see all zeros.',
      starter: { qiskit: `from qiskit import QuantumCircuit

n = 2
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
qc.barrier()
# TODO: balanced oracle — CNOT from each input to the ancilla (qubit n)

qc.barrier()
qc.h(range(n))
qc.measure(range(n), range(n))`, cirq: `import cirq

n = 2
inputs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)

circuit = cirq.Circuit()
circuit.append(cirq.X(anc))
circuit.append([cirq.H(q) for q in inputs + [anc]])
# TODO: balanced oracle — CNOT from each input to anc

circuit.append([cirq.H(q) for q in inputs])
circuit.append(cirq.measure(*inputs, key='x'))` },
      solution: { qiskit: `from qiskit import QuantumCircuit

n = 2
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
qc.barrier()
qc.cx(0, n)
qc.cx(1, n)
qc.barrier()
qc.h(range(n))
qc.measure(range(n), range(n))`, cirq: `import cirq

n = 2
inputs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)

circuit = cirq.Circuit()
circuit.append(cirq.X(anc))
circuit.append([cirq.H(q) for q in inputs + [anc]])
circuit.append([cirq.CNOT(q, anc) for q in inputs])
circuit.append([cirq.H(q) for q in inputs])
circuit.append(cirq.measure(*inputs, key='x'))` },
      check: [{ type: 'measured' }, { type: 'dist' }],
      hints: ['The oracle goes between the two layers of H gates.', { qiskit: '~qc.cx(0, n)~ and ~qc.cx(1, n)~', cirq: '~cirq.CNOT(inputs[0], anc)~ and ~cirq.CNOT(inputs[1], anc)~' }],
    },
  },
  {
    id: 'bernstein-vazirani', module: 'm4', title: 'Bernstein–Vazirani: Read a Secret in One Shot', minutes: 15,
    blurb: 'Find a hidden bitstring with a single query.',
    blocks: [
      { t: 'md', v: `A black box computes $f(x) = s \\cdot x \\pmod 2$ for a secret bitstring $s$. Classically you need n queries — one per bit. With the same structure as Deutsch–Jozsa, **one quantum query reveals all of s**.

The oracle is simple: for each bit of s that is 1, add a CNOT from that input qubit to the ancilla ($\\ket{-}$). Phase kickback marks exactly those qubits, and the final H layer turns the pattern of phases into the bitstring itself.` },
      {
        t: 'code', title: 'Recover s = 011',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

s = '011'
n = len(s)
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
for i, bit in enumerate(reversed(s)):   # Qiskit: rightmost char = qubit 0
    if bit == '1':
        qc.cx(i, n)
qc.h(range(n))
qc.measure(range(n), range(n))

print(AerSimulator().run(qc, shots=100).result().get_counts())`,
        cirq: `import cirq

s = '011'
n = len(s)
xs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)

circuit = cirq.Circuit(cirq.X(anc), cirq.H.on_each(*xs, anc))
for q, bit in zip(xs, s):            # Cirq: first char = first qubit
    if bit == '1':
        circuit.append(cirq.CNOT(q, anc))
circuit.append(cirq.H.on_each(*xs))
circuit.append(cirq.measure(*xs, key='s'))

result = cirq.Simulator().run(circuit, repetitions=100)
print(result)                        # s=0000..., 1111..., 1111... (one record per qubit)
print(result.histogram(key='s'))     # Counter({3: 100}) -> 3 = 0b011`,
      },
      { t: 'md', qiskit: 'Notice ~reversed(s)~: because Qiskit prints qubit 0 on the right, we read the secret right-to-left so the counts print as ~011~.', cirq: 'Cirq\'s printed result shows the record for each qubit in order. Because Cirq is big-endian, the first character of s maps to the first qubit.' },
    ],
    quiz: { q: 'How many oracle queries does Bernstein–Vazirani need for a 100-bit secret?', options: ['1', '7', '100', '2¹⁰⁰'], answer: 0, why: 'One query, regardless of n. Classically you need 100.' },
    exercise: {
      prompt: { qiskit: "Recover the secret **s = '101'**. Measure the 3 input qubits — the counts should read ~'101'~ every time.", cirq: 'Recover the secret **s = \'101\'**. Measure the 3 input qubits with key ~\'s\'~ — the result should be 101 every time.' },
      starter: { qiskit: `from qiskit import QuantumCircuit

s = '101'
n = len(s)
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
# TODO: oracle for s

qc.h(range(n))
qc.measure(range(n), range(n))`, cirq: `import cirq

s = '101'
n = len(s)
xs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)
circuit = cirq.Circuit(cirq.X(anc), cirq.H.on_each(*xs, anc))
# TODO: oracle for s

circuit.append(cirq.H.on_each(*xs))
circuit.append(cirq.measure(*xs, key='s'))` },
      solution: { qiskit: `from qiskit import QuantumCircuit

s = '101'
n = len(s)
qc = QuantumCircuit(n + 1, n)
qc.x(n)
qc.h(range(n + 1))
for i, bit in enumerate(reversed(s)):
    if bit == '1':
        qc.cx(i, n)
qc.h(range(n))
qc.measure(range(n), range(n))`, cirq: `import cirq

s = '101'
n = len(s)
xs = cirq.LineQubit.range(n)
anc = cirq.LineQubit(n)
circuit = cirq.Circuit(cirq.X(anc), cirq.H.on_each(*xs, anc))
for q, bit in zip(xs, s):
    if bit == '1':
        circuit.append(cirq.CNOT(q, anc))
circuit.append(cirq.H.on_each(*xs))
circuit.append(cirq.measure(*xs, key='s'))` },
      check: [{ type: 'measured' }, { type: 'dist' }],
      hints: ['One CNOT (input → ancilla) for every 1 in s.', { qiskit: "For '101': qubits 0 and 2.", cirq: "For '101': xs[0] and xs[2]." }],
    },
  },
  {
    id: 'teleportation', module: 'm4', title: 'Quantum Teleportation', minutes: 18,
    blurb: 'Move a qubit\'s state using entanglement and two classical bits.',
    blocks: [
      { t: 'md', v: `Alice has a qubit in an unknown state $\\ket{\\psi}$. She and Bob share a Bell pair. **Teleportation** transfers $\\ket{\\psi}$ to Bob's qubit — without ever sending the qubit itself.

1. **Share entanglement:** H + CNOT make a Bell pair on qubits 1 (Alice) and 2 (Bob).
2. **Alice's Bell measurement:** CNOT(0→1), then H on qubit 0.
3. **Bob's corrections:** if qubit 1 reads 1, apply X to Bob; if qubit 0 reads 1, apply Z.

On real hardware step 3 uses mid-circuit measurement and classical feed-forward. In a simulator we can use the **deferred-measurement principle**: replace "measure then classically control" with a quantum **CX(1→2)** and **CZ(0→2)**. Same result, simpler code.

Watch Bob's Bloch sphere (qubit 2): at the end it points exactly where qubit 0 started.` },
      {
        t: 'code', title: 'Teleport RX(1.1)|0⟩',
        qiskit: `from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

qc = QuantumCircuit(3)
qc.rx(1.1, 0)          # the state to teleport
qc.barrier()
qc.h(1)                # Bell pair between 1 and 2
qc.cx(1, 2)
qc.barrier()
qc.cx(0, 1)            # Alice's Bell-basis rotation
qc.h(0)
qc.barrier()
qc.cx(1, 2)            # Bob's corrections (deferred measurement)
qc.cz(0, 2)
print(qc)`,
        cirq: `import cirq

msg, alice, bob = cirq.LineQubit.range(3)
circuit = cirq.Circuit(
    cirq.rx(1.1)(msg),                  # the state to teleport
    cirq.H(alice), cirq.CNOT(alice, bob),   # Bell pair
    cirq.CNOT(msg, alice), cirq.H(msg),     # Alice's Bell-basis rotation
    cirq.CNOT(alice, bob), cirq.CZ(msg, bob),   # Bob's corrections
)
print(circuit)`,
      },
      { t: 'callout', kind: 'tip', v: 'Use the step controls and compare qubit 0\'s sphere at step 1 with qubit 2\'s sphere at the end. Notice the middle steps: during teleportation Bob\'s qubit is maximally entangled (arrow at the centre).' },
    ],
    quiz: { q: 'Does teleportation let you send information faster than light?', options: ['Yes — the state arrives instantly', 'No — Bob needs Alice\'s two classical bits', 'Only for entangled states', 'Only in simulators'], answer: 1, why: 'Without Alice\'s measurement results (sent classically), Bob\'s qubit is completely random.' },
    exercise: {
      prompt: { qiskit: 'Teleport the state **RY(π/3)$\\ket{0}$** from qubit 0 to qubit 2. Bob\'s qubit (2) must end in that exact state.', cirq: 'Teleport the state **RY(π/3)$\\ket{0}$** from ~msg~ to ~bob~. Bob\'s qubit must end in that exact state.' },
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

qc = QuantumCircuit(3)
qc.ry(np.pi / 3, 0)     # state to teleport
# TODO: Bell pair on 1 and 2

# TODO: Alice's operations on 0 and 1

# TODO: Bob's corrections on 2
`, cirq: `import numpy as np
import cirq

msg, alice, bob = cirq.LineQubit.range(3)
circuit = cirq.Circuit(cirq.ry(np.pi / 3)(msg))
# TODO: Bell pair on alice and bob

# TODO: Alice's operations

# TODO: Bob's corrections
` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

qc = QuantumCircuit(3)
qc.ry(np.pi / 3, 0)
qc.h(1)
qc.cx(1, 2)
qc.cx(0, 1)
qc.h(0)
qc.cx(1, 2)
qc.cz(0, 2)`, cirq: `import numpy as np
import cirq

msg, alice, bob = cirq.LineQubit.range(3)
circuit = cirq.Circuit(cirq.ry(np.pi / 3)(msg))
circuit.append([cirq.H(alice), cirq.CNOT(alice, bob)])
circuit.append([cirq.CNOT(msg, alice), cirq.H(msg)])
circuit.append([cirq.CNOT(alice, bob), cirq.CZ(msg, bob)])` },
      check: [{ type: 'qubits', n: 3 }, {
        type: 'custom', fn: (u) => {
          if (!u.sim || u.view.wires.length < 3) return { msg: 'Bob\'s qubit isn\'t part of the circuit yet — it needs gates acting on it.' };
          const bobQ = u.view.wires[2].q;
          const v = blochVector(u.sim.final, bobQ);
          const t = { x: Math.sin(Math.PI / 3), y: 0, z: Math.cos(Math.PI / 3) };
          const d = Math.hypot(v.x - t.x, v.y - t.y, v.z - t.z);
          if (d < 0.02) return null;
          const L = Math.hypot(v.x, v.y, v.z);
          return { msg: L < 0.9 ? `Bob's qubit is still entangled (Bloch length ${L.toFixed(2)}). Check Alice's operations and Bob's corrections.` : `Bob's qubit points to (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) but should match the original (${t.x.toFixed(2)}, 0, ${t.z.toFixed(2)}).`, line: u.view.ops[u.view.ops.length - 1]?.span?.line };
        },
      }],
      hints: ['Bell pair: H on the middle qubit, then CNOT middle → Bob.', 'Alice: CNOT(message → alice), then H on message.', 'Bob: CNOT(alice → bob), then CZ(message → bob).'],
    },
  },
  {
    id: 'grover', module: 'm4', title: "Grover's Search", minutes: 18,
    blurb: 'Amplify the right answer: find a marked item in √N steps.',
    blocks: [
      { t: 'md', v: `Searching N unsorted items classically takes about $\\frac{N}{2}$ guesses on average. **Grover's algorithm** needs about $\\sqrt{N}$.

Each Grover iteration has two parts:

1. **Oracle** — flips the *sign* (phase) of the marked state. Probabilities don't change yet!
2. **Diffuser** — "inversion about the mean": amplitudes below average shrink, the flipped one grows.

For 2 qubits ($N = 4$), **one iteration finds the answer with 100% certainty**.

To mark $\\ket{11}$ the oracle is just **CZ** (it gives $-1$ only to $\\ket{11}$). To mark a different state, sandwich CZ between X gates on the qubits that should be 0. The diffuser is: H, X on all · CZ · X, H on all.` },
      {
        t: 'code', title: 'Find |11⟩',
        qiskit: `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2)
qc.h([0, 1])           # uniform superposition
qc.barrier()
qc.cz(0, 1)            # oracle: mark |11>
qc.barrier()
qc.h([0, 1])           # diffuser
qc.x([0, 1])
qc.cz(0, 1)
qc.x([0, 1])
qc.h([0, 1])
qc.measure_all()

print(AerSimulator().run(qc, shots=1000).result().get_counts())`,
        cirq: `import cirq

a, b = cirq.LineQubit.range(2)
circuit = cirq.Circuit()
circuit.append(cirq.H.on_each(a, b))         # uniform superposition
circuit.append(cirq.CZ(a, b))                # oracle: mark |11>
circuit.append([cirq.H.on_each(a, b), cirq.X.on_each(a, b)])   # diffuser
circuit.append(cirq.CZ(a, b))
circuit.append([cirq.X.on_each(a, b), cirq.H.on_each(a, b)])
circuit.append(cirq.measure(a, b, key='found'))

print(cirq.Simulator().run(circuit, repetitions=1000).histogram(key='found'))`,
      },
      { t: 'callout', kind: 'tip', v: 'Step to just after the oracle: the probability bars are still all 25%, but the phase dial on $\\ket{11}$ has flipped. The diffuser then converts that phase into probability.' },
    ],
    quiz: { q: 'Right after the oracle (before the diffuser), the marked state\'s probability is…', options: ['0%', '25%', '50%', '100%'], answer: 1, why: 'The oracle only flips a sign. |−a|² = |a|², so probabilities are unchanged until the diffuser.' },
    exercise: {
      prompt: { qiskit: "Modify Grover's oracle to find the state Qiskit prints as **'10'** (qubit 1 = 1, qubit 0 = 0). Measure both qubits.", cirq: 'Modify Grover\'s oracle to find the state Cirq prints as **10** (a = 1, b = 0). Measure both qubits.' },
      starter: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
qc.h([0, 1])
# TODO: oracle that marks '10'

# diffuser
qc.h([0, 1])
qc.x([0, 1])
qc.cz(0, 1)
qc.x([0, 1])
qc.h([0, 1])
qc.measure_all()`, cirq: `import cirq

a, b = cirq.LineQubit.range(2)
circuit = cirq.Circuit(cirq.H.on_each(a, b))
# TODO: oracle that marks 10 (a=1, b=0)

# diffuser
circuit.append([cirq.H.on_each(a, b), cirq.X.on_each(a, b)])
circuit.append(cirq.CZ(a, b))
circuit.append([cirq.X.on_each(a, b), cirq.H.on_each(a, b)])
circuit.append(cirq.measure(a, b, key='found'))` },
      solution: { qiskit: `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)
qc.h([0, 1])
qc.x(0)
qc.cz(0, 1)
qc.x(0)
qc.h([0, 1])
qc.x([0, 1])
qc.cz(0, 1)
qc.x([0, 1])
qc.h([0, 1])
qc.measure_all()`, cirq: `import cirq

a, b = cirq.LineQubit.range(2)
circuit = cirq.Circuit(cirq.H.on_each(a, b))
circuit.append([cirq.X(b), cirq.CZ(a, b), cirq.X(b)])
circuit.append([cirq.H.on_each(a, b), cirq.X.on_each(a, b)])
circuit.append(cirq.CZ(a, b))
circuit.append([cirq.X.on_each(a, b), cirq.H.on_each(a, b)])
circuit.append(cirq.measure(a, b, key='found'))` },
      check: [{ type: 'measured' }, { type: 'dist' }],
      hints: ['CZ alone marks $\\ket{11}$. To mark a state with a 0 in some position, flip that qubit with X before and after CZ.', { qiskit: "'10' has qubit 0 = 0 → X on qubit 0 around the CZ.", cirq: '10 has b = 0 → X on b around the CZ.' }],
    },
  },
  {
    id: 'qft', module: 'm4', title: 'The Quantum Fourier Transform', minutes: 20,
    blurb: 'The engine inside Shor\'s algorithm and phase estimation.',
    blocks: [
      { t: 'md', v: `The **QFT** turns information stored in *basis states* into information stored in *phases*. It's the quantum version of the discrete Fourier transform and the key ingredient of Shor's factoring algorithm:

$$\\mathrm{QFT}\\ket{x} = \\frac{1}{\\sqrt{2^n}} \\sum_{k=0}^{2^n - 1} e^{\\frac{2\\pi i\\, x k}{2^n}} \\ket{k}$$

For each qubit (from most significant to least):
1. Apply **H**.
2. For every less significant qubit k below it, apply a **controlled phase** of $\\frac{\\pi}{2^d}$, where $d$ is the distance between the qubits.

Finally **swap** the qubit order. With n qubits that's only about $\\frac{n^2}{2}$ gates — exponentially fewer than a classical FFT on $2^n$ numbers.

Look at the phase dials after running: the QFT of a basis state has **equal probabilities everywhere** — all the information is in the phases, which rotate at a rate set by the input.` },
      {
        t: 'code', title: 'QFT on 3 qubits',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit

def qft(qc, n):
    for j in reversed(range(n)):          # most significant first
        qc.h(j)
        for k in reversed(range(j)):
            qc.cp(np.pi / 2 ** (j - k), k, j)
    for i in range(n // 2):
        qc.swap(i, n - i - 1)

qc = QuantumCircuit(3)
qc.x(0)            # input |001> (the number 1)
qft(qc, 3)
print(qc)`,
        cirq: `import numpy as np
import cirq

def qft(qubits):
    n = len(qubits)
    ops = []
    for i in range(n):                    # most significant first
        ops.append(cirq.H(qubits[i]))
        for j in range(i + 1, n):
            ops.append(cirq.CZ(qubits[j], qubits[i]) ** (1 / 2 ** (j - i)))
    for i in range(n // 2):
        ops.append(cirq.SWAP(qubits[i], qubits[n - i - 1]))
    return ops

q = cirq.LineQubit.range(3)
circuit = cirq.Circuit(cirq.X(q[2]))     # input |001> (the number 1)
circuit.append(qft(q))
print(circuit)`,
      },
      { t: 'md', qiskit: '~qc.cp(θ, control, target)~ is the controlled-phase gate. Because phase gates are symmetric, control and target could be swapped without changing the result.', cirq: '~cirq.CZ ** t~ is a controlled phase of π·t — so ~CZ ** 0.5~ is a controlled-S and ~CZ ** 0.25~ a controlled-T.' },
    ],
    quiz: { q: 'After applying the QFT to any computational basis state, the measurement probabilities are…', options: ['All on one outcome', 'Uniform over all outcomes', 'Half on 0, half on 1', 'Random each time'], answer: 1, why: 'The QFT of a basis state has equal-magnitude amplitudes; only the phases differ.' },
    exercise: {
      prompt: { qiskit: 'Prepare the input **$\\ket{101}$** (the number 5: X on qubits 0 and 2), then apply the **3-qubit QFT**.', cirq: 'Prepare the input **$\\ket{101}$** (the number 5: X on q[0] and q[2]), then apply the **3-qubit QFT**.' },
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

def qft(qc, n):
    # TODO: H + controlled phases for each qubit, then swaps
    pass

qc = QuantumCircuit(3)
qc.x(0)
qc.x(2)
qft(qc, 3)`, cirq: `import numpy as np
import cirq

def qft(qubits):
    ops = []
    # TODO: H + controlled phases for each qubit, then swaps
    return ops

q = cirq.LineQubit.range(3)
circuit = cirq.Circuit(cirq.X(q[0]), cirq.X(q[2]))
circuit.append(qft(q))` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit

def qft(qc, n):
    for j in reversed(range(n)):
        qc.h(j)
        for k in reversed(range(j)):
            qc.cp(np.pi / 2 ** (j - k), k, j)
    for i in range(n // 2):
        qc.swap(i, n - i - 1)

qc = QuantumCircuit(3)
qc.x(0)
qc.x(2)
qft(qc, 3)`, cirq: `import numpy as np
import cirq

def qft(qubits):
    ops = []
    n = len(qubits)
    for i in range(n):
        ops.append(cirq.H(qubits[i]))
        for j in range(i + 1, n):
            ops.append(cirq.CZ(qubits[j], qubits[i]) ** (1 / 2 ** (j - i)))
    for i in range(n // 2):
        ops.append(cirq.SWAP(qubits[i], qubits[n - i - 1]))
    return ops

q = cirq.LineQubit.range(3)
circuit = cirq.Circuit(cirq.X(q[0]), cirq.X(q[2]))
circuit.append(qft(q))` },
      check: [{ type: 'state' }],
      hints: ['Start from the most significant qubit: H, then controlled phases π/2, π/4 from the qubits below it.', 'Don\'t forget the final SWAP of the outer qubits.', { qiskit: '~qc.cp(np.pi / 2 ** (j - k), k, j)~ inside a double loop.', cirq: '~cirq.CZ(qubits[j], qubits[i]) ** (1 / 2 ** (j - i))~ inside a double loop.' }],
    },
  },
  // ------------------------------------------------------------------ M5
  {
    id: 'parameters', module: 'm5', title: 'Parameterised Circuits', minutes: 15,
    blurb: 'Write a circuit once, run it for many angles — the basis of variational algorithms.',
    blocks: [
      { t: 'md', v: `Many modern algorithms (VQE, QAOA, quantum machine learning) use circuits with **adjustable angles**. Instead of hard-coding numbers, you put in a **symbol** and bind values later.

This lets an optimiser tweak θ, run, measure, and tweak again — a loop between classical and quantum computers.` },
      { t: 'md', qiskit: `In Qiskit, create a symbol with ~Parameter('θ')~, use it like a number, then ~qc.assign_parameters({theta: value})~ returns a bound copy. Running a circuit with unbound parameters is an error — try it.`, cirq: `Cirq uses **sympy** symbols: ~sympy.Symbol('theta')~. Bind them at run time with ~param_resolver={'theta': value}~, or sweep many values with ~cirq.Linspace~ and ~run_sweep~.` },
      {
        t: 'code', title: 'Sweep an angle',
        qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import Parameter
from qiskit_aer import AerSimulator

theta = Parameter('θ')
qc = QuantumCircuit(1)
qc.ry(theta, 0)
qc.measure_all()
print(qc)

sim = AerSimulator()
for value in np.linspace(0, np.pi, 5):
    bound = qc.assign_parameters({theta: value})
    counts = sim.run(bound, shots=1000).result().get_counts()
    print(f"θ = {value:.2f}: P(1) ≈ {counts.get('1', 0) / 1000:.2f}")`,
        cirq: `import numpy as np
import sympy
import cirq

theta = sympy.Symbol('theta')
q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.ry(theta)(q), cirq.measure(q, key='m'))
print(circuit)

sim = cirq.Simulator()
sweep = cirq.Linspace('theta', start=0, stop=np.pi, length=5)
for result in sim.run_sweep(circuit, params=sweep, repetitions=1000):
    value = result.params['theta']
    p1 = result.histogram(key='m')[1] / 1000
    print(f"θ = {value:.2f}: P(1) ≈ {p1:.2f}")`,
      },
    ],
    quiz: { q: 'Why use parameters instead of plain numbers?', options: ['They run faster on hardware', 'Write one circuit, evaluate it for many angles (e.g. in an optimisation loop)', 'They avoid measurement errors', 'They are required for entanglement'], answer: 1, why: 'Parameterised circuits are templates — perfect for classical optimisers that search over angles.' },
    exercise: {
      prompt: { qiskit: 'Create a 1-qubit circuit with ~ry(theta, 0)~ where ~theta = Parameter(\'θ\')~, measure it, **bind θ = π/2**, and run it for 1000 shots. Print the counts (≈50/50).', cirq: 'Create a 1-qubit circuit with ~cirq.ry(theta)~ where ~theta = sympy.Symbol(\'theta\')~, measure it (key ~\'m\'~), and run 1000 repetitions with **theta = π/2** via ~param_resolver~. Print the histogram (≈50/50).' },
      starter: { qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import Parameter
from qiskit_aer import AerSimulator

theta = Parameter('θ')
qc = QuantumCircuit(1)
# TODO: ry(theta), measure, bind θ = π/2, run, print counts
`, cirq: `import numpy as np
import sympy
import cirq

theta = sympy.Symbol('theta')
q = cirq.LineQubit(0)
# TODO: ry(theta), measure, run with theta = π/2, print histogram
` },
      solution: { qiskit: `import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import Parameter
from qiskit_aer import AerSimulator

theta = Parameter('θ')
qc = QuantumCircuit(1)
qc.ry(theta, 0)
qc.measure_all()
bound = qc.assign_parameters({theta: np.pi / 2})
counts = AerSimulator().run(bound, shots=1000).result().get_counts()
print(counts)`, cirq: `import numpy as np
import sympy
import cirq

theta = sympy.Symbol('theta')
q = cirq.LineQubit(0)
circuit = cirq.Circuit(cirq.ry(theta)(q), cirq.measure(q, key='m'))
result = cirq.Simulator().run(circuit, param_resolver={'theta': np.pi / 2}, repetitions=1000)
print(result.histogram(key='m'))` },
      check: [{ type: 'code', regex: 'Parameter\\(|Symbol\\(', msg: 'Use a symbolic parameter (not a plain number) for the angle.' }, { type: 'ran', shots: 1000 }, {
        type: 'custom', fn: (u, s, fw) => {
          const r = u.runs[u.runs.length - 1];
          let p1;
          if (fw === 'qiskit') { const c = new Map(r.counts.entries()); p1 = (c.get('1') || 0) / r.shots; }
          else { const m = [...r.countsByKey.values()][0]; p1 = (m.get('1') || 0) / r.shots; }
          return Math.abs(p1 - 0.5) < 0.08 ? null : { msg: `Your P(1) ≈ ${(p1 * 100).toFixed(0)}% — with θ = π/2 it should be about 50%.`, line: r.span?.line };
        },
      }, { type: 'stdout', lines: 1 }],
      hints: { qiskit: ['~qc.ry(theta, 0)~ then ~qc.measure_all()~.', '~bound = qc.assign_parameters({theta: np.pi / 2})~ — run ~bound~, not ~qc~.'], cirq: ["~cirq.Circuit(cirq.ry(theta)(q), cirq.measure(q, key='m'))~", "~sim.run(circuit, param_resolver={'theta': np.pi / 2}, repetitions=1000)~"] },
    },
  },
  {
    id: 'hardware', module: 'm5', title: 'From Simulator to Real Hardware', minutes: 12,
    blurb: 'Transpilation, noise, and what changes when your code meets a real chip.',
    blocks: [
      { t: 'md', v: `Everything so far ran on a perfect simulator. Real quantum processors add three big constraints:

### 1. Native gates
Hardware only implements a few gates (for example ~rz~, ~sx~, ~x~, ~ecr~/~cz~). Your H, CNOT and RY are **transpiled** — rewritten into native gates.

### 2. Connectivity
Two-qubit gates only work between physically connected qubits. If you CNOT two distant qubits, the compiler inserts **SWAPs**, increasing depth.

### 3. Noise
Gates have small errors, qubits slowly lose their state (**decoherence**), and readout sometimes flips bits. Deeper circuits = more noise. That's why depth and gate count matter, and why results from hardware look like ~{'00': 471, '11': 489, '01': 22, '10': 18}~ instead of a clean Bell pair.` },
      {
        t: 'code', title: 'Preparing for hardware', noRun: true,
        qiskit: `# Reference only — needs an IBM Quantum account and network access.
from qiskit import QuantumCircuit, transpile
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2 as Sampler

service = QiskitRuntimeService()          # uses your saved API token
backend = service.least_busy(operational=True, simulator=False)

qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.measure_all()

isa = transpile(qc, backend=backend, optimization_level=3)
print(isa.count_ops(), "depth:", isa.depth())

job = Sampler(backend).run([isa], shots=1000)
print(job.result()[0].data.meas.get_counts())`,
        cirq: `# Reference only — needs Google Quantum AI access (or a provider plugin).
import cirq
import cirq_google

q0, q1 = cirq.GridQubit(4, 4), cirq.GridQubit(4, 5)   # adjacent on the chip
circuit = cirq.Circuit(cirq.H(q0), cirq.CNOT(q0, q1), cirq.measure(q0, q1, key='m'))

# Compile to the device's native gate set:
native = cirq.optimize_for_target_gateset(circuit, gateset=cirq.CZTargetGateset())
print(native)

engine = cirq_google.get_engine()
result = engine.get_sampler(processor_id='your-processor').run(native, repetitions=1000)
print(result.histogram(key='m'))`,
      },
      { t: 'md', v: `### Where to go next
- **Qiskit:** create a free IBM Quantum account, install ~qiskit~, ~qiskit-aer~ and ~qiskit-ibm-runtime~ locally, and try the Bell circuit on a real device.
- **Cirq:** install ~cirq~; explore ~cirq.DensityMatrixSimulator~ with noise models like ~cirq.depolarize(p=0.01)~ to see how errors change results.
- Explore **variational algorithms** (VQE, QAOA), **error mitigation**, and **quantum error correction** — the road to fault-tolerant quantum computers.

Everything you wrote in QProg is real Qiskit / Cirq code: copy it into a Jupyter notebook and it will run.` },
    ],
    quiz: { q: 'Why does transpiling a circuit for real hardware often increase its depth?', options: ['Hardware runs slower', 'Gates are rewritten into native gates and SWAPs are inserted for connectivity', 'Measurements must be repeated', 'Python is slow'], answer: 1, why: 'Non-native gates are decomposed, and SWAPs route interactions between unconnected qubits.' },
  },
];

export const lessonById = (id) => LESSONS.find(l => l.id === id);
export const pick = (v, fw) => (v && typeof v === 'object' && !Array.isArray(v) && (v.qiskit !== undefined || v.cirq !== undefined || v.both !== undefined)) ? (v.both ?? v[fw]) : v;

export const PLAYGROUND_EXAMPLES = {
  qiskit: [
    { name: 'Bell pair', code: LESSONS.find(l => l.id === 'bell').blocks[2].qiskit },
    { name: 'GHZ (loop)', code: LESSONS.find(l => l.id === 'ghz').blocks[1].qiskit },
    { name: "Grover's search", code: LESSONS.find(l => l.id === 'grover').blocks[1].qiskit },
    { name: 'Teleportation', code: LESSONS.find(l => l.id === 'teleportation').blocks[1].qiskit },
    { name: 'QFT', code: LESSONS.find(l => l.id === 'qft').blocks[1].qiskit },
    { name: 'Blank', code: `from qiskit import QuantumCircuit\nfrom qiskit_aer import AerSimulator\n\nqc = QuantumCircuit(2)\n` },
  ],
  cirq: [
    { name: 'Bell pair', code: LESSONS.find(l => l.id === 'bell').blocks[2].cirq },
    { name: 'GHZ (loop)', code: LESSONS.find(l => l.id === 'ghz').blocks[1].cirq },
    { name: "Grover's search", code: LESSONS.find(l => l.id === 'grover').blocks[1].cirq },
    { name: 'Teleportation', code: LESSONS.find(l => l.id === 'teleportation').blocks[1].cirq },
    { name: 'QFT', code: LESSONS.find(l => l.id === 'qft').blocks[1].cirq },
    { name: 'Blank', code: `import cirq\n\nq0, q1 = cirq.LineQubit.range(2)\ncircuit = cirq.Circuit()\n` },
  ],
};
