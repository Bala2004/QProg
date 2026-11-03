// The QuTiP track: an advanced path through the physics of quantum systems.
// Same lesson format as lessons.js; every code block runs in QProg's QuTiP 5 sandbox.

export const QUTIP_MODULES = [
  { id: 'u0', title: 'Quantum Objects', sub: 'States, operators and composite systems as matrices' },
  { id: 'u1', title: 'Dynamics', sub: 'Hamiltonians, solvers and driven qubits' },
  { id: 'u2', title: 'Open Quantum Systems', sub: 'Decoherence, light–matter coupling and equilibrium' },
];

const IMPORTS = 'from qutip import *\nimport numpy as np';
const PLOT = 'from qutip import *\nimport numpy as np\nimport matplotlib.pyplot as plt';

export const QUTIP_LESSONS = [
  // ------------------------------------------------------------------ U0
  {
    id: 'qt-objects', module: 'u0', title: 'Quantum Objects: Kets, Bras & Operators', minutes: 14,
    blurb: 'QuTiP thinks in linear algebra rather than circuits. Meet the Qobj and the three numbers it gives you.',
    blocks: [
      { t: 'md', v: `**QuTiP** — the Quantum Toolbox in Python — is what physicists reach for when they want to know how a real quantum system *behaves*: a superconducting qubit losing energy, an atom trading a photon with a cavity, a spin precessing in a magnetic field.

Qiskit and Cirq describe **programs**: circuits of discrete gates. QuTiP describes **physics**: states and operators as matrices that evolve continuously in time and leak into their environment. That makes this track more mathematical than the other two. It assumes you already know qubits, superposition and the Bloch sphere; the first module of either circuit track covers them.

### Everything is a Qobj
A quantum object (~Qobj~) is a matrix plus bookkeeping about what it represents:

- ~basis(N, n)~ is the ket $\\ket{n}$ in an N-level space, a column vector.
- ~psi.dag()~ is its bra $\\bra{n}$, the conjugate transpose.
- ~sigmax()~, ~sigmay()~, ~sigmaz()~ are the Pauli operators, square matrices.

~*~ (or ~@~) is matrix multiplication, so ~sigmax() * psi~ applies $\\sigma_x$ to $\\ket{\\psi}$.` },
      { t: 'code', title: 'Your first quantum objects', both: `${IMPORTS}

psi = basis(2, 0)
print(psi)

flipped = sigmax() * psi
print(flipped)

print("dims:", flipped.dims, " shape:", flipped.shape, " type:", flipped.type)` },
      { t: 'callout', kind: 'tip', v: `**QuTiP's spin convention.** ~basis(2, 0)~ is the $+1$ eigenstate of ~sigmaz()~: spin up, the **north pole** of the Bloch sphere, just like $\\ket{0}$ in the circuit tracks. ~sigmam()~ lowers it to ~basis(2, 1)~, the south pole. Keep this picture in mind when energy starts to decay later in the course.` },
      { t: 'md', v: `### Three numbers a Qobj gives you
**Inner products.** $\\braket{\\phi}{\\psi}$ is a bra times a ket. ~phi.dag() * psi~ gives a 1×1 Qobj; ~phi.overlap(psi)~ hands you the complex number directly.

**Expectation values.** For an observable $O$ (a Hermitian operator), $\\langle O \\rangle = \\bra{\\psi} O \\ket{\\psi}$ is the average of many measurements. ~expect(O, psi)~ computes it. The operator comes **first**.

**Bloch coordinates.** For a qubit, the three Pauli expectation values *are* the Bloch vector: $(\\langle\\sigma_x\\rangle, \\langle\\sigma_y\\rangle, \\langle\\sigma_z\\rangle)$. QProg draws the last state your program creates on the sphere.` },
      { t: 'code', title: 'Superposition, overlap and the Bloch vector', both: `${IMPORTS}

plus = (basis(2, 0) + basis(2, 1)).unit()   # unit() normalises
print("overlap with |0>:", plus.overlap(basis(2, 0)))

bloch = [expect(op, plus) for op in (sigmax(), sigmay(), sigmaz())]
print("Bloch vector:", np.round(bloch, 3))

print("Is sigmax Hermitian?", sigmax().isherm)` },
      { t: 'md', v: `~unit()~ divides by the norm, so you never have to type $1/\\sqrt{2}$. Try replacing ~basis(2, 1)~ with ~1j * basis(2, 1)~ and watch the arrow swing to the $y$ axis.` },
    ],
    quiz: { q: 'What does ~sigmax() * basis(2, 0)~ return?', options: ['The ket ~basis(2, 1)~', 'A bra', 'The number 0', 'An error: you can\'t multiply an operator by a ket'], answer: 0, why: '$\\sigma_x$ is the quantum NOT: it maps $\\ket{0}$ to $\\ket{1}$. An operator times a ket is another ket.' },
    exercise: {
      prompt: `Build $\\ket{\\psi} = \\frac{1}{\\sqrt{2}}\\left(\\ket{0} + i\\ket{1}\\right)$ (use ~1j~ and ~.unit()~) and store it in ~psi~. Then print its Bloch vector as **three numbers on one line**: $\\langle\\sigma_x\\rangle$, $\\langle\\sigma_y\\rangle$, $\\langle\\sigma_z\\rangle$, each rounded to 3 decimal places.`,
      starter: { both: `${IMPORTS}

# TODO: build psi = (|0> + i|1>) / sqrt(2)
psi = basis(2, 0)

# TODO: print <sx>, <sy>, <sz>, each rounded to 3 places
` },
      solution: { both: `${IMPORTS}

psi = (basis(2, 0) + 1j * basis(2, 1)).unit()

print(round(expect(sigmax(), psi), 3), round(expect(sigmay(), psi), 3), round(expect(sigmaz(), psi), 3))` },
      check: [{ type: 'qstate', name: 'psi', msg: 'Your state psi isn\'t (|0⟩ + i|1⟩)/√2 yet. Check the 1j and the .unit().' }, { type: 'stdout', same: true }],
      hints: ['~1j * basis(2, 1)~ multiplies the ket by $i$.', 'Add the two kets, then call ~.unit()~ on the sum.', 'One ~print~ with three ~round(expect(op, psi), 3)~ values, separated by commas.'],
      success: 'That state sits on the +y axis of the Bloch sphere: a circular superposition.',
    },
  },
  {
    id: 'qt-composite', module: 'u0', title: 'Composite Systems & Entanglement', minutes: 16,
    blurb: 'Tensor products, operators that act on one part, and how partial traces measure entanglement.',
    blocks: [
      { t: 'md', v: `Two quantum systems together live in the **tensor product** of their spaces. ~tensor(a, b)~ builds it, for kets and operators alike:

- ~tensor(basis(2, 0), basis(2, 1))~ is $\\ket{0}\\otimes\\ket{1} = \\ket{01}$, with dims ~[[2, 2], [1, 1]]~.
- ~tensor(sigmax(), qeye(2))~ is $X \\otimes I$: flip the **first** subsystem and leave the second alone.

The first argument is the leftmost label, as in Cirq. Qiskit writes its labels the other way round.

### Gates are just matrices
QuTiP has no circuit object to append gates to. A gate is an operator, and you build it from pieces you know:

$$H = \\frac{\\sigma_x + \\sigma_z}{\\sqrt{2}}, \\qquad \\text{CNOT} = \\ket{0}\\bra{0} \\otimes I + \\ket{1}\\bra{1} \\otimes X$$

~psi.proj()~ gives the projector $\\ket{\\psi}\\bra{\\psi}$.` },
      { t: 'code', title: 'A Bell pair from matrices', both: `${IMPORTS}

H = (sigmax() + sigmaz()) / np.sqrt(2)
P0, P1 = basis(2, 0).proj(), basis(2, 1).proj()
CNOT = tensor(P0, qeye(2)) + tensor(P1, sigmax())

psi = CNOT * tensor(H, qeye(2)) * tensor(basis(2, 0), basis(2, 0))
print(psi)
print("Same as bell_state('00')?", psi == bell_state('00'))` },
      { t: 'md', v: `### Looking at one half: the partial trace
What does qubit 0 look like *on its own*? ~psi.ptrace(0)~ traces out everything except subsystem 0 and returns its **reduced density matrix**, an operator describing that part alone.

For a product state the reduced state is pure. For a Bell pair it is $I/2$: the **maximally mixed** state. Each qubit on its own is a coin flip. Everything interesting lives in the correlations between them.

Two numbers quantify this:
- **Entanglement entropy** ~entropy_vn(rho, 2)~ of the reduced state, in bits: 0 for a product state, 1 for a Bell pair.
- **Concurrence** ~concurrence(psi)~ for two qubits: 0 for unentangled, 1 for maximal.` },
      { t: 'code', title: 'Measuring entanglement', both: `${IMPORTS}

bell = bell_state('00')
product = tensor((basis(2, 0) + basis(2, 1)).unit(), basis(2, 0))

for name, state in [("Bell", bell), ("product", product)]:
    rho0 = state.ptrace(0)
    S = entropy_vn(rho0, 2)
    print(f"{name:8s} entropy = {S:.3f} bits   concurrence = {concurrence(state):.3f}")

print(bell.ptrace(0))` },
      { t: 'callout', kind: 'warn', v: `The Bloch spheres in the visualiser show each qubit's *reduced* state. For a Bell pair both arrows shrink to nothing. The information hasn't vanished: it has moved into the correlations, which no single-qubit picture can show.` },
    ],
    quiz: { q: 'You trace out one qubit of the Bell state $(\\ket{00}+\\ket{11})/\\sqrt{2}$. What is left?', options: ['The pure state $\\ket{0}$', 'The pure state $\\ket{+}$', 'The maximally mixed state $I/2$', 'Nothing: ptrace of a Bell state is zero'], answer: 2, why: 'Each half of a maximally entangled pair is maximally mixed: 50/50 populations and no coherence. Its von Neumann entropy is exactly 1 bit.' },
    exercise: {
      prompt: `Build the **singlet** $\\frac{1}{\\sqrt{2}}\\left(\\ket{01} - \\ket{10}\\right)$ from ~tensor~ and ~basis~ and store it in ~psi~. Print three lines:
1. whether ~psi == singlet_state()~,
2. the entanglement entropy of qubit 0 in bits, rounded to 6 places,
3. the concurrence, rounded to 6 places.`,
      starter: { both: `${IMPORTS}

up, down = basis(2, 0), basis(2, 1)

# TODO: psi = (|01> - |10>) / sqrt(2)
psi = tensor(up, down)

print(psi == singlet_state())
# TODO: entropy of qubit 0 (base 2) and the concurrence, rounded to 6 places
` },
      solution: { both: `${IMPORTS}

up, down = basis(2, 0), basis(2, 1)

psi = (tensor(up, down) - tensor(down, up)).unit()

print(psi == singlet_state())
print(round(entropy_vn(psi.ptrace(0), 2), 6))
print(round(concurrence(psi), 6))` },
      check: [{ type: 'qstate', name: 'psi', msg: 'psi isn\'t the singlet yet: it needs |01⟩ minus |10⟩, normalised.' }, { type: 'stdout', same: true }],
      hints: ['~tensor(up, down)~ is $\\ket{01}$; ~tensor(down, up)~ is $\\ket{10}$.', 'Subtract them and call ~.unit()~.', '~entropy_vn(psi.ptrace(0), 2)~ gives bits; ~concurrence(psi)~ works on the ket directly.'],
      success: 'The singlet is maximally entangled: 1 bit of entropy and concurrence 1.',
    },
  },
  {
    id: 'qt-density', module: 'u0', title: 'Density Matrices & Mixed States', minutes: 16,
    blurb: 'When you are unsure which state you have: populations, coherences, purity and the inside of the Bloch sphere.',
    blocks: [
      { t: 'md', v: `A ket describes a state you know perfectly. Real experiments rarely give you that: a noisy source, a qubit entangled with its environment, a thermal fridge. A **density matrix** describes a *statistical mixture*:

$$\\rho = \\sum_i p_i \\ket{\\psi_i}\\bra{\\psi_i}$$

~ket2dm(psi)~ turns a ket into $\\ket{\\psi}\\bra{\\psi}$, and you mix by adding weighted copies.

### Reading a density matrix
- **Diagonal** entries are **populations**: the probability of finding each basis state.
- **Off-diagonal** entries are **coherences**: the phase relationships that make interference possible.
- **Purity** $\\mathrm{Tr}\\,\\rho^2$ is 1 for a pure state and $1/d$ for the maximally mixed state of dimension $d$.

On the Bloch sphere, pure states sit **on** the surface and mixed states **inside** it; the arrow's length is $\\sqrt{2\\,\\mathrm{Tr}\\rho^2 - 1}$.` },
      { t: 'code', title: 'Same populations, different physics', both: `${IMPORTS}

plus = (basis(2, 0) + basis(2, 1)).unit()
coherent = ket2dm(plus)
mixed = 0.5 * ket2dm(basis(2, 0)) + 0.5 * ket2dm(basis(2, 1))

for name, rho in [("|+><+|", coherent), ("50/50 mixture", mixed)]:
    print(name)
    print(rho.full().real)
    print(f"  <sx> = {expect(sigmax(), rho):.2f}   purity = {rho.purity():.2f}\\n")` },
      { t: 'md', v: `Both states give 0 or 1 with equal odds if you measure $\\sigma_z$. Only the coherent one has $\\langle\\sigma_x\\rangle = 1$. **Decoherence**, the enemy of every quantum computer, is precisely the loss of those off-diagonal terms. You will watch it happen in the last module.

### How close are two states?
- ~fidelity(a, b)~ is 1 for identical states and 0 for orthogonal ones. QuTiP's fidelity is $\\mathrm{Tr}\\sqrt{\\sqrt{\\rho}\\,\\sigma\\sqrt{\\rho}}$, which for two kets is $|\\braket{a}{b}|$.
- ~tracedist(a, b)~ is the best probability margin with which a single measurement can tell them apart.` },
      { t: 'code', title: 'Fidelity and trace distance', both: `${IMPORTS}

target = ket2dm(basis(2, 0))
for p in [1.0, 0.9, 0.5]:
    rho = p * target + (1 - p) * ket2dm(basis(2, 1))
    print(f"p = {p:.1f}   fidelity = {fidelity(rho, target):.3f}   trace distance = {tracedist(rho, target):.3f}")` },
    ],
    quiz: { q: 'What is the purity $\\mathrm{Tr}\\,\\rho^2$ of the maximally mixed qubit state $I/2$?', options: ['0', '0.5', '1', '2'], answer: 1, why: '$\\rho^2 = I/4$, whose trace is $2 \\times 1/4 = 1/2$. In general the maximally mixed state of dimension $d$ has purity $1/d$.' },
    exercise: {
      prompt: `A noisy source emits $\\ket{+}$ with probability 0.8 and $\\ket{-}$ with probability 0.2. Build its density matrix ~rho~. Print three numbers on one line, each rounded to 3 places: $\\langle\\sigma_x\\rangle$, the purity, and the fidelity with $\\ket{+}$.`,
      starter: { both: `${IMPORTS}

plus = (basis(2, 0) + basis(2, 1)).unit()
minus = (basis(2, 0) - basis(2, 1)).unit()

# TODO: rho = 0.8 |+><+| + 0.2 |-><-|
rho = ket2dm(plus)

# TODO: print <sx>, purity and fidelity with plus, each rounded to 3 places
` },
      solution: { both: `${IMPORTS}

plus = (basis(2, 0) + basis(2, 1)).unit()
minus = (basis(2, 0) - basis(2, 1)).unit()

rho = 0.8 * ket2dm(plus) + 0.2 * ket2dm(minus)

print(round(expect(sigmax(), rho), 3), round(rho.purity(), 3), round(fidelity(rho, plus), 3))` },
      check: [{ type: 'qstate', name: 'rho', msg: 'rho isn\'t the 80/20 mixture of |+⟩ and |−⟩ yet.' }, { type: 'stdout', same: true }],
      hints: ['Mix with weights: ~0.8 * ket2dm(plus) + 0.2 * ket2dm(minus)~.', '~rho.purity()~ gives $\\mathrm{Tr}\\,\\rho^2$.', '~fidelity(rho, plus)~ accepts a density matrix and a ket.'],
      success: 'The Bloch arrow now points along +x with length 0.6: a pure direction, blurred by 20% noise.',
    },
  },
  // ------------------------------------------------------------------ U1
  {
    id: 'qt-hamiltonian', module: 'u1', title: 'Hamiltonians, Energies & Unitaries', minutes: 16,
    blurb: 'The energy operator decides everything: its spectrum, its stationary states, and the unitary it generates.',
    blocks: [
      { t: 'md', v: `Every closed quantum system has a **Hamiltonian** $H$, the operator for its total energy. Diagonalise it and you get:

- its **eigenenergies**, the allowed energy levels: ~H.eigenenergies()~;
- its **eigenstates**, the stationary states that only pick up a phase as time passes: ~H.eigenstates()~.

Time evolution is the unitary $U(t) = e^{-iHt}$ (QuTiP works in units where $\\hbar = 1$), so ~(-1j * H * t).expm()~ evolves any state by time $t$.

### The simplest Hamiltonian: a spin in a field
$H = \\frac{\\omega}{2}\\sigma_z$ has two levels split by $\\omega$. A superposition **precesses** around the $z$ axis at angular frequency $\\omega$. A quantum gate is exactly this: evolution under some Hamiltonian for just the right time. A $Z$ gate is half a turn of precession.` },
      { t: 'code', title: 'Precession under H = ω σz / 2', both: `${IMPORTS}

w = 2 * np.pi          # one full turn per unit time
H = 0.5 * w * sigmaz()
print("energies:", H.eigenenergies())

psi0 = (basis(2, 0) + basis(2, 1)).unit()
for t in [0, 0.25, 0.5]:
    psi = (-1j * H * t).expm() * psi0
    print(f"t = {t:.2f}   <sx> = {expect(sigmax(), psi):+.3f}   <sy> = {expect(sigmay(), psi):+.3f}")` },
      { t: 'md', v: `### Two coupled spins: the transverse-field Ising model
$$H = -J\\,\\sigma_z\\otimes\\sigma_z - h\\left(\\sigma_x\\otimes I + I\\otimes\\sigma_x\\right)$$

The $J$ term wants the spins **aligned**; the field $h$ wants each spin pointing along $x$. These pull in different directions, and the ground state is a compromise that is **entangled**. ~H.groundstate()~ returns the lowest energy and its state.` },
      { t: 'code', title: 'Ground-state entanglement vs field strength', both: `${IMPORTS}

J = 1.0
ZZ = tensor(sigmaz(), sigmaz())
X = tensor(sigmax(), qeye(2)) + tensor(qeye(2), sigmax())

for h in [0.1, 0.5, 1.0, 3.0]:
    H = -J * ZZ - h * X
    E0, g = H.groundstate()
    S = entropy_vn(g.ptrace(0), 2)
    print(f"h = {h:.1f}   E0 = {E0:+.4f}   entanglement = {S:.3f} bits")` },
      { t: 'md', v: `A weak field gives a cat-like state $\\approx(\\ket{00}+\\ket{11})/\\sqrt{2}$, nearly 1 bit of entanglement. A strong field gives a product state with both spins along $x$, close to 0 bits. That crossover is a small cousin of a **quantum phase transition**.` },
    ],
    quiz: { q: 'For $H = \\frac{\\omega}{2}\\sigma_z$, what is the gap between the two energy levels?', options: ['$\\omega/2$', '$\\omega$', '$2\\omega$', '$\\omega^2$'], answer: 1, why: 'The eigenvalues are $+\\omega/2$ and $-\\omega/2$, so the gap is $\\omega$. That gap is also the precession frequency.' },
    exercise: {
      prompt: `For the Ising Hamiltonian above with **J = 1**, loop over ~h~ in ~[0.25, 0.5, 1.0, 2.0]~. For each, print one line with ~h~, the ground-state energy rounded to 4 places, and the ground-state entanglement entropy of qubit 0 (in bits) rounded to 4 places.`,
      starter: { both: `${IMPORTS}

J = 1.0
ZZ = tensor(sigmaz(), sigmaz())
X = tensor(sigmax(), qeye(2)) + tensor(qeye(2), sigmax())

for h in [0.25, 0.5, 1.0, 2.0]:
    H = -J * ZZ - h * X
    # TODO: find the ground state, then print h, E0 and the entropy (both rounded to 4)
` },
      solution: { both: `${IMPORTS}

J = 1.0
ZZ = tensor(sigmaz(), sigmaz())
X = tensor(sigmax(), qeye(2)) + tensor(qeye(2), sigmax())

for h in [0.25, 0.5, 1.0, 2.0]:
    H = -J * ZZ - h * X
    E0, g = H.groundstate()
    print(h, round(E0, 4), round(entropy_vn(g.ptrace(0), 2), 4))` },
      check: [{ type: 'stdout', same: true }],
      hints: ['~E0, g = H.groundstate()~ unpacks the energy and the state.', '~g.ptrace(0)~ is qubit 0 on its own.', '~print(h, round(E0, 4), round(entropy_vn(g.ptrace(0), 2), 4))~'],
      success: 'Entanglement falls as the field wins: the ground state goes from a cat state to a product state.',
    },
  },
  {
    id: 'qt-sesolve', module: 'u1', title: 'Time Evolution with sesolve', minutes: 16,
    blurb: 'Let QuTiP integrate the Schrödinger equation: Rabi oscillations, expectation values over time and Bloch-sphere trajectories.',
    blocks: [
      { t: 'md', v: `Exponentiating $H$ works for one moment in time. To follow a system continuously, solve the **Schrödinger equation**

$$\\frac{d}{dt}\\ket{\\psi(t)} = -iH\\ket{\\psi(t)}$$

numerically with ~sesolve(H, psi0, tlist, e_ops=[...])~:
- ~tlist~ is the array of times you care about, e.g. ~np.linspace(0, 10, 200)~.
- ~e_ops~ lists operators whose expectation values QuTiP records at every time.
- ~result.expect[k]~ is the array for the k-th operator.

### Rabi oscillations
Drive a spin with $H = \\frac{\\Omega}{2}\\sigma_x$ and it rotates about $x$: the population swings between up and down as $\\cos^2(\\Omega t/2)$. This is the most fundamental experiment in quantum control. Plot it with matplotlib and QProg draws it live as you edit.` },
      { t: 'code', title: 'Rabi oscillations', both: `${PLOT}

Omega = 2 * np.pi * 0.5        # Rabi frequency
H = 0.5 * Omega * sigmax()
times = np.linspace(0, 4, 300)

result = sesolve(H, basis(2, 0), times, e_ops=[sigmaz(), sigmay()])

P_up = (1 + result.expect[0]) / 2
plt.plot(times, P_up, label="P(up)")
plt.plot(times, result.expect[1], label="<sy>")
plt.xlabel("time")
plt.legend()
plt.show()

print("P(up) after a half period:", round(P_up[np.argmin(np.abs(times - 1.0))], 3))` },
      { t: 'callout', kind: 'tip', v: `Change ~Omega~ in the editor and watch the curve redraw. Doubling the drive strength doubles the oscillation speed: that's how experiments calibrate their pulses.` },
      { t: 'md', v: `### Seeing the whole trajectory
With ~e_ops~ given, QuTiP 5 saves only the expectation values. Ask for the states too with ~options={"store_states": True}~ and you can trace the path on a ~Bloch()~ sphere. Add them with ~kind="point"~ for a trail of dots.

A Hamiltonian tilted between $x$ and $z$ makes the arrow sweep a **cone** around the tilted axis. That's what any $H = \\vec{n}\\cdot\\vec{\\sigma}$ does.` },
      { t: 'code', title: 'A precession cone on the Bloch sphere', both: `${IMPORTS}

H = 0.5 * 2 * np.pi * (sigmaz() + sigmax()) / np.sqrt(2)   # axis halfway between z and x
times = np.linspace(0, 1, 60)
result = sesolve(H, basis(2, 0), times, options={"store_states": True})

b = Bloch()
b.add_states(result.states, kind="point")
b.add_vectors([1 / np.sqrt(2), 0, 1 / np.sqrt(2)])        # the rotation axis
b.show()` },
    ],
    quiz: { q: 'A drive $H = \\frac{\\Omega}{2}\\sigma_x$ flips spin up to spin down. How long does a full flip (a "π pulse") take?', options: ['$\\Omega$', '$\\pi/\\Omega$', '$2\\pi/\\Omega$', '$\\Omega/\\pi$'], answer: 1, why: 'The populations go as $\\cos^2(\\Omega t/2)$, which first reaches 0 when $\\Omega t/2 = \\pi/2$, so at $t = \\pi/\\Omega$. That is a rotation of π about x.' },
    exercise: {
      prompt: `With ~Omega = 2 * np.pi * 0.25~ and ~H = 0.5 * Omega * sigmax()~, evolve ~basis(2, 0)~ over ~times = np.linspace(0, 4, 401)~ while recording $\\langle\\sigma_z\\rangle$. Find the **π-pulse time**, the first time $\\langle\\sigma_z\\rangle$ is lowest, with ~np.argmin~. Print that time rounded to 2 places, then the minimum value rounded to 3, on one line.`,
      starter: { both: `${IMPORTS}

Omega = 2 * np.pi * 0.25
H = 0.5 * Omega * sigmax()
times = np.linspace(0, 4, 401)

# TODO: sesolve with e_ops=[sigmaz()], then locate the minimum of <sz>
` },
      solution: { both: `${IMPORTS}

Omega = 2 * np.pi * 0.25
H = 0.5 * Omega * sigmax()
times = np.linspace(0, 4, 401)

result = sesolve(H, basis(2, 0), times, e_ops=[sigmaz()])
sz = result.expect[0]
i = np.argmin(sz)
print(round(times[i], 2), round(sz[i], 3))` },
      check: [{ type: 'stdout', same: true }],
      hints: ['~result = sesolve(H, basis(2, 0), times, e_ops=[sigmaz()])~', '~i = np.argmin(result.expect[0])~ is the index of the minimum.', 'Print ~times[i]~ and ~result.expect[0][i]~, rounded.'],
      success: 'π/Ω = 2.0: you just calibrated a π pulse.',
    },
  },
  {
    id: 'qt-driven', module: 'u1', title: 'Driven Qubits: Resonance & the Rotating Frame', minutes: 18,
    blurb: 'Time-dependent Hamiltonians, why drives must be on resonance, and the frame change every lab uses.',
    blocks: [
      { t: 'md', v: `A real qubit isn't driven by a static $\\sigma_x$. It has its own splitting $\\omega_0$, and a microwave field oscillating at frequency $\\omega_d$ pushes on it:

$$H(t) = \\frac{\\omega_0}{2}\\sigma_z + \\Omega\\cos(\\omega_d t)\\,\\sigma_x$$

QuTiP writes a time-dependent Hamiltonian as a **list**: a constant part, then ~[operator, coefficient]~ pairs. The coefficient can be a Python function ~f(t, args)~ or a string such as ~"cos(wd*t)"~. Numbers you want to vary go in ~args~.` },
      { t: 'code', title: 'A resonant drive in the lab frame', both: `${PLOT}

w0 = 2 * np.pi * 5.0         # qubit frequency
Omega = 2 * np.pi * 0.2      # drive strength

def drive(t, args):
    return Omega * np.cos(args["wd"] * t)

H = [0.5 * w0 * sigmaz(), [sigmax(), drive]]
times = np.linspace(0, 5, 1000)
result = sesolve(H, basis(2, 0), times, e_ops=[sigmaz()], args={"wd": w0})

plt.plot(times, (1 + result.expect[0]) / 2, label="P(up)")
plt.xlabel("time")
plt.show()` },
      { t: 'md', v: `The population still swings slowly from up to down, but with fast wiggles on top. Simulating every one of those oscillations at $\\omega_0$ is expensive, so physicists move into the **rotating frame** that turns along with the drive. After dropping the terms that oscillate at $2\\omega_d$ (the *rotating-wave approximation*), the Hamiltonian becomes time-independent:

$$H_\\text{rot} = \\frac{\\Delta}{2}\\sigma_z + \\frac{\\Omega}{2}\\sigma_x, \\qquad \\Delta = \\omega_0 - \\omega_d$$

On resonance ($\\Delta = 0$) you get the clean Rabi flopping of the previous lesson. Off resonance the spin rotates about a tilted axis, so it **never fully flips**:

$$P_\\text{max} = \\frac{\\Omega^2}{\\Omega^2 + \\Delta^2}$$` },
      { t: 'code', title: 'Detuning scan in the rotating frame', both: `${IMPORTS}

Omega = 1.0
times = np.linspace(0, 15, 1500)
for Delta in [0.0, 0.5, 1.0, 3.0]:
    H = 0.5 * Delta * sigmaz() + 0.5 * Omega * sigmax()
    r = sesolve(H, basis(2, 0), times, e_ops=[sigmaz()])
    P_flip = (1 - r.expect[0]) / 2
    print(f"Delta = {Delta:.1f}   simulated max = {max(P_flip):.3f}   formula = {Omega**2 / (Omega**2 + Delta**2):.3f}")` },
    ],
    quiz: { q: 'In the rotating frame, the detuning equals the Rabi frequency ($\\Delta = \\Omega$). What is the largest flip probability?', options: ['1', '0.75', '0.5', '0.25'], answer: 2, why: '$\\Omega^2/(\\Omega^2 + \\Delta^2) = \\Omega^2 / 2\\Omega^2 = 1/2$. The rotation axis sits at 45°, so the arrow only reaches the equator.' },
    exercise: {
      prompt: `Write the lab-frame drive with a **string coefficient** instead of a function: ~H = [0.5 * w0 * sigmaz(), [sigmax(), "Om * cos(wd * t)"]]~, passing ~Om~ and ~wd~ in ~args~. Use ~w0 = 2 * np.pi * 5.0~, ~Om = 2 * np.pi * 0.2~ and drive on resonance. Evolve ~basis(2, 0)~ over ~np.linspace(0, 5, 1000)~ and print the **largest** flip probability $(1 - \\langle\\sigma_z\\rangle)/2$ rounded to 2 places.`,
      starter: { both: `${IMPORTS}

w0 = 2 * np.pi * 5.0
Om = 2 * np.pi * 0.2
times = np.linspace(0, 5, 1000)

# TODO: the Hamiltonian in list format with the string "Om * cos(wd * t)"
H = 0.5 * w0 * sigmaz()

# TODO: sesolve with args={"Om": Om, "wd": w0} and print the max flip probability
` },
      solution: { both: `${IMPORTS}

w0 = 2 * np.pi * 5.0
Om = 2 * np.pi * 0.2
times = np.linspace(0, 5, 1000)

H = [0.5 * w0 * sigmaz(), [sigmax(), "Om * cos(wd * t)"]]
result = sesolve(H, basis(2, 0), times, e_ops=[sigmaz()], args={"Om": Om, "wd": w0})
print(round(max((1 - result.expect[0]) / 2), 2))` },
      check: [{ type: 'code', regex: '["\']\\s*Om\\s*\\*\\s*cos', msg: 'Use the string coefficient "Om * cos(wd * t)" in your Hamiltonian list.' }, { type: 'stdout', same: true }],
      hints: ['The list is ~[H0, [H1, "Om * cos(wd * t)"]]~.', 'Pass ~args={"Om": Om, "wd": w0}~ to ~sesolve~.', '~max((1 - result.expect[0]) / 2)~, then round to 2.'],
      success: 'On resonance the drive flips the qubit completely, even with the fast lab-frame wiggles.',
    },
  },
  // ------------------------------------------------------------------ U2
  {
    id: 'qt-mesolve', module: 'u2', title: 'Decoherence & the Lindblad Master Equation', minutes: 18,
    blurb: 'Energy loss (T1), dephasing (T2) and the collapse operators that model an environment.',
    blocks: [
      { t: 'md', v: `No qubit is truly isolated. Its environment steals energy and scrambles phases. When you can't track the environment, you describe the qubit with a density matrix obeying the **Lindblad master equation**:

$$\\dot\\rho = -i[H, \\rho] + \\sum_k \\left( C_k \\rho C_k^\\dagger - \\tfrac{1}{2}\\{C_k^\\dagger C_k, \\rho\\} \\right)$$

Each **collapse operator** $C_k$ is one way the environment acts:

- **Energy relaxation**, $C = \\sqrt{\\gamma}\\,\\sigma_-$, empties the upper level at rate $\\gamma = 1/T_1$.
- **Pure dephasing**, $C = \\sqrt{\\gamma_\\phi/2}\\,\\sigma_z$, erases coherences at rate $\\gamma_\\phi = 1/T_\\phi$ and leaves populations alone.

~mesolve(H, rho0, tlist, c_ops, e_ops)~ integrates it. Same pattern as ~sesolve~, plus a list of collapse operators.` },
      { t: 'code', title: 'T1: watching energy leak away', both: `${PLOT}

T1 = 5.0
times = np.linspace(0, 20, 200)
c_ops = [np.sqrt(1 / T1) * sigmam()]

result = mesolve(0 * sigmaz(), basis(2, 0), times, c_ops, e_ops=[sigmaz()])
P_up = (1 + result.expect[0]) / 2

plt.plot(times, P_up, label="mesolve")
plt.plot(times, np.exp(-times / T1), label="exp(-t/T1)")
plt.xlabel("time")
plt.legend()
plt.show()` },
      { t: 'md', v: `### T2: the loss of phase
Start in $\\ket{+}$ with a small splitting $\\Delta$ and the arrow precesses around the equator. It also shrinks, because both relaxation and dephasing eat the coherence. The coherence time $T_2$ combines them:

$$\\frac{1}{T_2} = \\frac{1}{2T_1} + \\frac{1}{T_\\phi}$$

In a Ramsey experiment, the oscillating $\\langle\\sigma_x\\rangle$ fades with envelope $e^{-t/T_2}$. On the Bloch sphere the trajectory **spirals inward**, from the pure surface towards the mixed interior.` },
      { t: 'code', title: 'A Ramsey spiral', both: `${IMPORTS}

T1, Tphi = 20.0, 4.0
Delta = 2 * np.pi * 0.5
H = 0.5 * Delta * sigmaz()
c_ops = [np.sqrt(1 / T1) * sigmam(), np.sqrt(0.5 / Tphi) * sigmaz()]

times = np.linspace(0, 6, 150)
plus = (basis(2, 0) + basis(2, 1)).unit()
result = mesolve(H, plus, times, c_ops, e_ops=[sigmax(), sigmay(), sigmaz()])

b = Bloch()
b.add_points([result.expect[0], result.expect[1], result.expect[2]])
b.show()

T2 = 1 / (1 / (2 * T1) + 1 / Tphi)
print(f"T2 = {T2:.2f}")` },
      { t: 'callout', kind: 'warn', v: `$T_2 \\le 2T_1$ always. Even with perfect phase stability, losing energy destroys coherence too. Real superconducting qubits reach $T_1$ and $T_2$ of tens to hundreds of microseconds, and every gate must finish well inside that window.` },
    ],
    quiz: { q: 'A qubit starts in ~basis(2, 0)~ with collapse operator $\\sqrt{\\gamma}\\,\\sigma_-$ and no Hamiltonian. What is $P(\\text{up})$ after time $t = 1/\\gamma$?', options: ['0', '$1/2$', '$e^{-1} \\approx 0.37$', '$e^{-2} \\approx 0.14$'], answer: 2, why: 'Amplitude damping empties the upper level exponentially, $P(t) = e^{-\\gamma t}$. After one lifetime $T_1 = 1/\\gamma$ about 37% remains.' },
    exercise: {
      prompt: `Measure $T_2$ numerically. Start in $\\ket{+}$ with **no Hamiltonian** (~0 * sigmaz()~), $T_1 = 20$ and $T_\\phi = 10$. Evolve over ~times = np.linspace(0, 30, 3001)~ recording $\\langle\\sigma_x\\rangle$. Find the **first** time it drops below $1/e$ and print it rounded to 1 decimal place. (Theory says $T_2 = 8$.)`,
      starter: { both: `${IMPORTS}

T1, Tphi = 20.0, 10.0
times = np.linspace(0, 30, 3001)
plus = (basis(2, 0) + basis(2, 1)).unit()

# TODO: collapse operators for T1 and Tphi
c_ops = []

# TODO: mesolve, then find the first time <sx> < 1/e
` },
      solution: { both: `${IMPORTS}

T1, Tphi = 20.0, 10.0
times = np.linspace(0, 30, 3001)
plus = (basis(2, 0) + basis(2, 1)).unit()

c_ops = [np.sqrt(1 / T1) * sigmam(), np.sqrt(0.5 / Tphi) * sigmaz()]

result = mesolve(0 * sigmaz(), plus, times, c_ops, e_ops=[sigmax()])
sx = result.expect[0]
for t, v in zip(times, sx):
    if v < np.exp(-1):
        print(round(t, 1))
        break` },
      check: [{ type: 'stdout', same: true, msg: 'Your T2 doesn\'t match yet. Check both collapse operators: √(1/T1)·σ₋ and √(0.5/Tφ)·σz.' }],
      hints: ['Relaxation: ~np.sqrt(1 / T1) * sigmam()~. Dephasing: ~np.sqrt(0.5 / Tphi) * sigmaz()~.', '~mesolve(0 * sigmaz(), plus, times, c_ops, e_ops=[sigmax()])~', 'Loop over ~zip(times, result.expect[0])~ and ~break~ at the first value below ~np.exp(-1)~.'],
      success: 'Your simulation reproduces 1/T2 = 1/(2T1) + 1/Tφ.',
    },
  },
  {
    id: 'qt-cavity', module: 'u2', title: 'Light Meets Matter: the Jaynes–Cummings Model', minutes: 20,
    blurb: 'Photons in a box: truncated Fock spaces, coherent states and an atom trading energy with a cavity.',
    blocks: [
      { t: 'md', v: `Light in a cavity is a **harmonic oscillator** with infinitely many levels $\\ket{0}, \\ket{1}, \\ket{2}, \\dots$, one for each photon number. A computer can't store infinity, so QuTiP **truncates** to N levels:

- ~destroy(N)~ is the annihilation operator $a$, with $a\\ket{n} = \\sqrt{n}\\ket{n-1}$; ~a.dag()~ creates.
- ~num(N)~ $= a^\\dagger a$ counts photons.
- ~coherent(N, alpha)~ is laser-like light: a Poisson spread of photon numbers with mean $|\\alpha|^2$.

Pick N comfortably above the photon numbers your physics reaches, then check your results don't change when you raise it.` },
      { t: 'code', title: 'A coherent state of light', both: `${IMPORTS}

N = 15
alpha = 1.5
psi = coherent(N, alpha)
print("mean photon number:", round(expect(num(N), psi), 4), " vs |alpha|^2 =", alpha**2)
plot_fock_distribution(psi)` },
      { t: 'md', v: `### An atom in the box
Couple a two-level atom to the cavity mode and you get the **Jaynes–Cummings Hamiltonian**, the hydrogen atom of quantum optics:

$$H = \\omega_c\\, a^\\dagger a + \\frac{\\omega_a}{2}\\sigma_z + g\\left(a^\\dagger\\sigma_- + a\\,\\sigma_+\\right)$$

The coupling term swaps one quantum of energy between atom and light. Start with an excited atom in an empty cavity and the excitation sloshes back and forth: **vacuum Rabi oscillations**, a full swap every $\\pi/(2g)$.

The atom and the cavity are separate subsystems, so every operator is a ~tensor~ with the cavity first, then the atom.` },
      { t: 'code', title: 'Vacuum Rabi oscillations, with and without loss', both: `${PLOT}

N = 5
wc = wa = 2 * np.pi * 1.0
g = 2 * np.pi * 0.05

a = tensor(destroy(N), qeye(2))
sm = tensor(qeye(N), sigmam())
H = wc * a.dag() * a + 0.5 * wa * tensor(qeye(N), sigmaz()) + g * (a.dag() * sm + a * sm.dag())

psi0 = tensor(basis(N, 0), basis(2, 0))       # empty cavity, excited atom
times = np.linspace(0, 25, 400)

for kappa in [0.0, 0.1]:
    r = mesolve(H, psi0, times, [np.sqrt(kappa) * a], e_ops=[a.dag() * a])
    plt.plot(times, r.expect[0], label=f"photons, kappa={kappa}")
plt.xlabel("time")
plt.legend()
plt.show()` },
      { t: 'callout', kind: 'tip', v: `With cavity loss $\\kappa$ the photon escapes before it can return, and the oscillations die out. Strong coupling, $g \\gg \\kappa$, is the regime where light and matter truly hybridise. Superconducting qubits read out through microwave resonators live there.` },
    ],
    quiz: { q: 'Why can a truncated ~destroy(N)~ give wrong answers?', options: ['QuTiP rounds photon numbers to integers', 'The top level $\\ket{N-1}$ has nothing above it, so $a^\\dagger$ can\'t raise it; physics that reaches high photon numbers gets cut off', 'Annihilation operators are only valid for N = 2', 'The commutator $[a, a^\\dagger]$ becomes zero'], answer: 1, why: 'Truncation makes $a^\\dagger\\ket{N-1} = 0$ and breaks $[a, a^\\dagger] = 1$ in the top level. If your state has weight near the cutoff, increase N.' },
    exercise: {
      prompt: `With the lossless Jaynes–Cummings model above (~N = 5~, ~g = 2 * np.pi * 0.05~, empty cavity and excited atom), evolve over ~times = np.linspace(0, 10, 1001)~ recording the photon number. Print the time of the **first full swap**, where the photon number peaks, rounded to 2 places, then the peak photon number rounded to 3. (Theory: $\\pi/2g = 5$.)`,
      starter: { both: `${IMPORTS}

N = 5
wc = wa = 2 * np.pi * 1.0
g = 2 * np.pi * 0.05

a = tensor(destroy(N), qeye(2))
sm = tensor(qeye(N), sigmam())
H = wc * a.dag() * a + 0.5 * wa * tensor(qeye(N), sigmaz()) + g * (a.dag() * sm + a * sm.dag())
psi0 = tensor(basis(N, 0), basis(2, 0))
times = np.linspace(0, 10, 1001)

# TODO: evolve with e_ops=[a.dag() * a], then find the peak
` },
      solution: { both: `${IMPORTS}

N = 5
wc = wa = 2 * np.pi * 1.0
g = 2 * np.pi * 0.05

a = tensor(destroy(N), qeye(2))
sm = tensor(qeye(N), sigmam())
H = wc * a.dag() * a + 0.5 * wa * tensor(qeye(N), sigmaz()) + g * (a.dag() * sm + a * sm.dag())
psi0 = tensor(basis(N, 0), basis(2, 0))
times = np.linspace(0, 10, 1001)

result = sesolve(H, psi0, times, e_ops=[a.dag() * a])
n = result.expect[0]
i = np.argmax(n)
print(round(times[i], 2), round(n[i], 3))` },
      check: [{ type: 'stdout', same: true }],
      hints: ['No loss means ~sesolve~ works, or ~mesolve~ with ~c_ops=[]~.', '~np.argmax(result.expect[0])~ finds the peak.', 'Print ~times[i]~ and ~result.expect[0][i]~, rounded.'],
      success: 'One photon, fully transferred from the atom to the cavity at t = π/2g.',
    },
  },
  {
    id: 'qt-steady', module: 'u2', title: 'Steady States & Thermal Equilibrium', minutes: 15,
    blurb: 'Where driving and dissipation balance: solve for the long-time state directly, and meet thermal light.',
    blocks: [
      { t: 'md', v: `Leave a driven, damped system long enough and it forgets where it started. It settles into a **steady state** $\\rho_\\text{ss}$ with $\\dot\\rho = 0$. Instead of integrating to "long enough", ~steadystate(H, c_ops)~ solves the linear equation $\\mathcal{L}\\rho = 0$ directly.

### Thermal light
A cavity coupled to a warm environment with mean occupation $n_\\text{th}$ loses photons at rate $\\kappa(1+n_\\text{th})$ and gains them at rate $\\kappa\\, n_\\text{th}$. Its steady state is the **thermal state** ~thermal_dm(N, n_th)~: a geometric distribution of photon numbers, with no phase coherence at all.` },
      { t: 'code', title: 'A cavity thermalises', both: `${IMPORTS}

N, kappa, n_th = 12, 1.0, 0.8
a = destroy(N)
c_ops = [np.sqrt(kappa * (1 + n_th)) * a, np.sqrt(kappa * n_th) * a.dag()]

rho_ss = steadystate(a.dag() * a, c_ops)
print("photons in steady state:", round(expect(num(N), rho_ss), 4))
print("fidelity with thermal_dm:", round(fidelity(rho_ss, thermal_dm(N, n_th)), 6))
plot_fock_distribution(rho_ss)` },
      { t: 'md', v: `### Resonance fluorescence
Drive an atom on resonance while it decays and the two processes compete. In the rotating frame $H = \\frac{\\Omega}{2}\\sigma_x$ with $C = \\sqrt{\\gamma}\\,\\sigma_-$. A weak drive barely excites it; a strong one **saturates** the population at $1/2$, but never beyond. A drive alone can't create a population inversion against decay. Lasers need a cleverer, three-level trick.` },
      { t: 'code', title: 'Saturation of a driven, decaying atom', both: `${IMPORTS}

gamma = 1.0
for Omega in [0.2, 1.0, 5.0, 20.0]:
    H = 0.5 * Omega * sigmax()
    rho = steadystate(H, [np.sqrt(gamma) * sigmam()])
    P_up = (1 + expect(sigmaz(), rho)) / 2
    print(f"Omega = {Omega:5.1f}   excited population = {P_up:.4f}")` },
    ],
    quiz: { q: 'A qubit has amplitude damping ($\\sqrt{\\gamma}\\,\\sigma_-$) and nothing else. What is its steady state?', options: ['~basis(2, 0)~: spin up', '~basis(2, 1)~: spin down, whatever the starting state', 'The maximally mixed state', 'It has no steady state'], answer: 1, why: '$\\sigma_-$ only ever moves population down. Eventually all of it sits in ~basis(2, 1)~, the ground state in QuTiP\'s spin convention.' },
    exercise: {
      prompt: `For the driven, damped atom (~gamma = 1.0~, ~H = 0.5 * Omega * sigmax()~, ~c_ops = [np.sqrt(gamma) * sigmam()]~), loop over ~Omega~ in ~[0.5, 1.0, 2.0, 4.0]~. For each, print ~Omega~ and the steady-state **coherence** $|\\langle\\sigma_-\\rangle|$ rounded to 4 places on one line. ~expect~ returns a complex number for a non-Hermitian operator, so take its ~abs~.`,
      starter: { both: `${IMPORTS}

gamma = 1.0
for Omega in [0.5, 1.0, 2.0, 4.0]:
    H = 0.5 * Omega * sigmax()
    # TODO: steady state, then print Omega and abs(<sigma_minus>) rounded to 4
` },
      solution: { both: `${IMPORTS}

gamma = 1.0
for Omega in [0.5, 1.0, 2.0, 4.0]:
    H = 0.5 * Omega * sigmax()
    rho = steadystate(H, [np.sqrt(gamma) * sigmam()])
    print(Omega, round(abs(expect(sigmam(), rho)), 4))` },
      check: [{ type: 'stdout', same: true }],
      hints: ['~rho = steadystate(H, [np.sqrt(gamma) * sigmam()])~', '~expect(sigmam(), rho)~ is complex; ~abs(...)~ gives its size.', 'The coherence peaks near $\\Omega \\approx \\gamma/\\sqrt{2}$ and then falls: a saturated atom is nearly mixed.'],
      success: 'The coherence rises, peaks and falls: strong driving pushes the atom towards a mixed 50/50 state.',
    },
  },
];

export const QUTIP_PLAYGROUND = [
  { name: 'Rabi oscillations', code: QUTIP_LESSONS.find(l => l.id === 'qt-sesolve').blocks[1].both },
  { name: 'Ramsey spiral', code: QUTIP_LESSONS.find(l => l.id === 'qt-mesolve').blocks[3].both },
  { name: 'Jaynes–Cummings', code: QUTIP_LESSONS.find(l => l.id === 'qt-cavity').blocks[3].both },
  { name: 'Ising ground states', code: QUTIP_LESSONS.find(l => l.id === 'qt-hamiltonian').blocks[3].both },
  { name: 'Blank', code: `${IMPORTS}\n\npsi = basis(2, 0)\n` },
];
