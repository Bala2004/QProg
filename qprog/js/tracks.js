// The three learning tracks. Qiskit and Cirq share one circuit curriculum; QuTiP has its own.
import { LESSONS, MODULES, PLAYGROUND_EXAMPLES } from './lessons.js';
import { QUTIP_LESSONS, QUTIP_MODULES, QUTIP_PLAYGROUND } from './lessons-qutip.js';

export const TRACKS = ['qiskit', 'cirq', 'qutip'];
export const FW_NAME = { qiskit: 'Qiskit', cirq: 'Cirq', qutip: 'QuTiP' };
export const lessonsFor = (fw) => fw === 'qutip' ? QUTIP_LESSONS : LESSONS;
export const modulesFor = (fw) => fw === 'qutip' ? QUTIP_MODULES : MODULES;
export const playgroundFor = (fw) => fw === 'qutip' ? QUTIP_PLAYGROUND : PLAYGROUND_EXAMPLES[fw];
export const findLesson = (id) => LESSONS.find(l => l.id === id) || QUTIP_LESSONS.find(l => l.id === id);
export const isQutipLesson = (l) => QUTIP_LESSONS.includes(l);
