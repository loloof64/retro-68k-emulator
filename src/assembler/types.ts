export type Size = 'byte' | 'word' | 'long'

export type Operand =
  | { kind: 'dn' | 'an' | 'ind' | 'post' | 'pre'; n: number }
  | { kind: 'disp'; n: number; expr: string }
  | { kind: 'imm' | 'abs'; expr: string }

export interface EncodeContext {
  pc: number // address of the instruction's opcode word
  cc?: number // condition code, for Bcc/DBcc
  final: boolean // false while measuring: skip range checks
  eval(expr: string): number
}

export interface AssemblerError {
  line: number
  column: number
  message: string
}
