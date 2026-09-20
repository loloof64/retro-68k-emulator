/**
 * Retro 68K Emulator - Type Definitions
 */

import type { Operand, EncodeContext, Size } from '../assembler/types'

// Register indices
export enum Register {
  D0 = 0,
  D1 = 1,
  D2 = 2,
  D3 = 3,
  D4 = 4,
  D5 = 5,
  D6 = 6,
  D7 = 7,
  A0 = 8,
  A1 = 9,
  A2 = 10,
  A3 = 11,
  A4 = 12,
  A5 = 13,
  A6 = 14,
  A7 = 15, // Stack Pointer
}

// CPU Status Flags
export interface StatusFlags {
  C: boolean; // Carry
  V: boolean; // Overflow
  Z: boolean; // Zero
  N: boolean; // Negative
  X: boolean; // Extend
}

// CPU State
export interface CPUState {
  registers: Uint32Array; // D0-D7, A0-A7
  pc: number; // Program Counter
  sp: number; // Stack Pointer (A7)
  status: StatusFlags;
  halted: boolean;
  cycles: number;
}

// Instruction types
export interface Instruction {
  opcode: number;
  mnemonic: string;
  args: any[];
  size: 'byte' | 'word' | 'long';
}

// Assembly token
export interface Token {
  type: 'mnemonic' | 'register' | 'number' | 'label' | 'comma' | 'lparen' | 'rparen' | 'symbol';
  value: string;
  line: number;
  column: number;
}

// Assembled program
export interface AssembledProgram {
  bytecode: Uint8Array;
  origin: number; // address bytecode[0] belongs at (ORG)
  entry: number; // START address (END label, else origin)
  labels: Map<string, number>;
  symbols: Map<string, number>;
  lineMap: Map<number, number>; // bytecode offset -> source line
}

// Opcode definition
export interface OpcodeDefinition {
  mnemonic: string;
  encoding: string; // bit pattern
  size: 'byte' | 'word' | 'long' | 'variable';
  // Takes memory too (not just cpu/args): almost every addressing mode needs
  // it to read operands/extension words, and to leave cpu.pc past them.
  handler: (cpu: CPUState, memory: Memory, args: any[]) => number; // returns cycles
  // Optional: only assemblable instructions have one. Returns the opcode
  // word + extension words, or null when the operand shapes don't fit this
  // definition (the assembler then tries the next definition of that mnemonic).
  encode?: (operands: Operand[], size: Size, ctx: EncodeContext) => number[] | null;
}

// Memory interface
export interface Memory {
  read8(address: number): number;
  read16(address: number): number;
  read32(address: number): number;
  write8(address: number, value: number): void;
  write16(address: number, value: number): void;
  write32(address: number, value: number): void;
}

// Emulator state
export interface EmulatorState {
  cpu: CPUState;
  memory: Memory;
  running: boolean;
  breakpoints: Set<number>;
}

// Trap vector (for interrupts/syscalls)
export type TrapHandler = (cpu: CPUState, memory: Memory, trapNum: number) => void;
