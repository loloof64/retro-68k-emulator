import type { OpcodeDefinition } from '../types/cpu'

// One real instruction to prove the fetch-decode-execute loop end to end.
// The other ~80 opcodes from docs/OPCODES.md land here in later sessions.
const NOP: OpcodeDefinition = {
  mnemonic: 'NOP',
  encoding: '0100111001110001', // $4E71
  size: 'word',
  handler: () => 4,
}

export const opcodeTable: ReadonlyMap<number, OpcodeDefinition> = new Map([[0x4e71, NOP]])
