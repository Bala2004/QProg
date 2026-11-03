// Lesson videos. Qiskit track: youtube.com/@qiskit. Cirq track: youtube.com/@GoogleQuantumAI.
// Every ID was checked against YouTube's oEmbed endpoint (exists, embeddable, correct channel).
// Entry: [videoId, title, duration]

const V = {
  whatIsQiskit: ['P5cGeDKOIP0', 'What is Qiskit?', '1:26'],
  installQiskit: ['dZWz4Gs_BuI', 'How to Install Qiskit — Coding with Qiskit 1.x', '16:18'],
  blochViz: ['WjjUfEpej-0', 'Visualizing Qubits on the Bloch Sphere', '0:55'],
  qubitsWork: ['HSM1GfukQMI', 'How Qubits Really Work', '12:14'],
  singleSystems: ['3-c4xJa7Flk', 'Single Systems — Understanding Quantum Information & Computation, Lesson 1', '1:10:02'],
  circuitsLesson: ['30U2DTfIrOU', 'Quantum Circuits — Understanding Quantum Information & Computation, Lesson 3', '1:00:52'],
  whatIsCircuit: ['m2O4WdAhxns', 'What is a quantum circuit?', '1:47'],
  qssMeasure: ['NZD9APb7ZtY', 'Qubits and Quantum States, Quantum Circuits, Measurements — Part 1', '51:06'],
  uncertainty: ['nJD7znn5eMA', 'Uncertainty and the Bloch Sphere', '2:51'],
  whatIsSuperposition: ['mAgnIj0UXLY', 'What is Superposition?', '0:55'],
  superpositionDeep: ['TZ-sUHK8vVQ', 'Superposition: The Quantum Principle That Changes Everything', '17:29'],
  qubitOrder: ['EiqHj3_Avps', 'Why does Qiskit order its qubits the way it does? — 1 Minute Qiskit', '2:16'],
  multipleSystems: ['DfZZS8Spe7U', 'Multiple Systems — Understanding Quantum Information & Computation, Lesson 2', '1:04:53'],
  bellCreate: ['zsfcPf6adBA', 'Creating a Bell State in Qiskit', '0:50'],
  bellSample: ['9MOIBcYf9wk', 'How to sample a Bell State using Qiskit', '1:00'],
  entanglementSimple: ['rGRUFzPeJI4', 'Entanglement Explained Simply', '9:24'],
  entanglementAction: ['GSsElSQgMbU', 'Entanglement in Action — Understanding Quantum Information & Computation, Lesson 4', '1:08:42'],
  statevectorSim: ['GuppGy50dQ4', 'How can I Simulate Statevectors in Qiskit? — 1 Minute Qiskit', '2:09'],
  invertCircuit: ['SiPF2SVb7xc', 'How can I invert a unitary circuit? — 1 Minute Qiskit', '1:55'],
  barrier: ['CdoCPz6TC9k', 'What is the point of a barrier? — Nick Knows', '3:16'],
  kickbackShort: ['sP28GSmwzRA', 'The Phase Kickback mechanism explained', '1:15'],
  kickbackQiskit: ['455pmYaZXKw', 'Phase Kickback with Qiskit', '14:24'],
  deutschJozsa: ['QcK0GK7DUh8', 'Quantum vs Classical: Deutsch & Deutsch–Jozsa Algorithms Explained', '19:08'],
  queryAlgorithms: ['2wticzHE1vs', 'Quantum Query Algorithms — Understanding Quantum Information & Computation, Lesson 5', '1:19:18'],
  teleportWorks: ['jxqnzltpDdE', 'How Quantum Teleportation Really Works', '14:39'],
  teleportDemystified: ['KsvNsY4cVvE', 'Quantum Teleportation Demystified with a Quantum Computer', '13:08'],
  groverCoding: ['0RPFWZj7Jm0', "Grover's Algorithm — Coding with Qiskit", '18:31'],
  groverLesson: ['hnpjC8WQVrQ', "Grover's Algorithm — Understanding Quantum Information & Computation, Lesson 8", '54:56'],
  qftMusic: ['ha5Fs6l-vGk', 'The Quantum Fourier Transform Explained with Music', '18:01'],
  phaseEstimation: ['4nT0BTUxhJY', 'Phase Estimation and Factoring — Understanding Quantum Information & Computation, Lesson 7', '1:15:15'],
  paramCircuits: ['adeYx7bwYrA', 'How do I use parameterized circuits in Qiskit? — 1 Minute Qiskit', '3:38'],
  ansatz: ['mJqVFJsXfis', 'What is an Ansatz?', '0:37'],
  brokenQubits: ['9be41egAbes', "Every Qubit Is Broken. Here's the Fix.", '9:56'],
  transpilation: ['TmXlUUFMUgI', 'Intro to Transpilation — Matthew Treinish', '53:12'],
  noiseHardware: ['0z0kNUkxXNU', 'Noise, Hardware, and Reality — Haimeng Zhang', '55:42'],
  // Google Quantum AI
  cirqStart: ['4OQrPHmjpVc', 'Getting started with Cirq 1.0', '3:58'],
  cirqCircuit: ['MHYZgWmPhbI', 'How to build a quantum circuit with Cirq 1.0', '21:19'],
  cirqGates: ['H-xYNjEThr0', 'How to create custom gates in Cirq', '13:55'],
  cirqNoiseless: ['uO-9NeBdZ84', 'Noiseless simulation', '16:47'],
  cirqNoisy: ['rCpZbomO2PY', 'Noisy simulation and the QVM', '20:15'],
  cirqViz: ['pgyCEY8oMYA', '3D interactive visualizations using Cirq', '38:21'],
  languageOfNature: ['WjSxL0KGmFY', 'Quantum is the language of nature', '1:13'],
  qaoa: ['RqGpnRh7rCM', 'The Quantum Approximate Optimization Algorithm', '11:59'],
  willow: ['W7ppd_RY-UE', 'Meet Willow, our state-of-the-art quantum chip', '6:39'],
  qec: ['_ugJLuJ1_gM', 'Demonstrating Quantum Error Correction', '4:00'],
};

export const CHANNELS = {
  qiskit: { name: 'Qiskit', handle: '@qiskit', url: 'https://www.youtube.com/@qiskit' },
  cirq: { name: 'Google Quantum AI', handle: '@GoogleQuantumAI', url: 'https://www.youtube.com/@GoogleQuantumAI' },
};

const L = (qiskit, cirq) => ({ qiskit, cirq });

export const LESSON_VIDEOS = {
  'python-basics': L([V.whatIsQiskit, V.installQiskit], [V.cirqStart]),
  'qubits': L([V.qubitsWork, V.singleSystems], [V.languageOfNature, V.cirqStart]),
  'bloch-sphere': L([V.blochViz, V.uncertainty], [V.cirqViz]),
  'rules': L([V.singleSystems, V.qssMeasure], [V.cirqNoiseless]),
  'x-gate': L([V.whatIsCircuit, V.circuitsLesson], [V.cirqCircuit]),
  'measurement': L([V.uncertainty, V.qssMeasure], [V.cirqNoiseless]),
  'superposition': L([V.whatIsSuperposition, V.superpositionDeep], [V.languageOfNature]),
  'phase': L([V.blochViz, V.singleSystems], [V.cirqGates]),
  'rotations': L([V.blochViz, V.circuitsLesson], [V.cirqGates]),
  'multi-qubit': L([V.qubitOrder, V.multipleSystems], [V.cirqCircuit]),
  'cnot': L([V.whatIsCircuit, V.circuitsLesson], [V.cirqCircuit]),
  'bell': L([V.bellCreate, V.bellSample, V.entanglementSimple], []),
  'ghz': L([V.entanglementSimple, V.entanglementAction], []),
  'statevector': L([V.statevectorSim, V.singleSystems], [V.cirqNoiseless, V.cirqViz]),
  'circuit-anatomy': L([V.invertCircuit, V.barrier], [V.cirqCircuit]),
  'deutsch-jozsa': L([V.kickbackShort, V.kickbackQiskit, V.deutschJozsa], []),
  'bernstein-vazirani': L([V.kickbackShort, V.queryAlgorithms], []),
  'teleportation': L([V.teleportWorks, V.teleportDemystified], []),
  'grover': L([V.groverCoding, V.groverLesson], []),
  'qft': L([V.qftMusic, V.phaseEstimation], []),
  'parameters': L([V.paramCircuits, V.ansatz], [V.qaoa]),
  'hardware': L([V.brokenQubits, V.transpilation, V.noiseHardware], [V.cirqNoisy, V.willow, V.qec]),
};

// "short" under 4 minutes, "deep dive" over 40
export function lengthTag(d) {
  const parts = d.split(':').map(Number);
  const s = parts.reduce((a, x) => a * 60 + x, 0);
  return s < 240 ? 'Quick watch' : s > 2400 ? 'Deep dive' : 'Explainer';
}
