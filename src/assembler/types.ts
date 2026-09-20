export type Size = 'byte' | 'word' | 'long'

// Index register of a brief extension word: D0-D7/A0-A7, .W (default) or .L.
export interface IndexReg {
  a: boolean
  num: number
  long: boolean
}

export type Operand =
  | { kind: 'dn' | 'an' | 'ind' | 'post' | 'pre'; n: number }
  | { kind: 'disp'; n: number; expr: string }
  | { kind: 'imm' | 'abs' | 'pcdisp'; expr: string } // pcdisp: d(PC)
  | { kind: 'idx'; n: number; expr: string; xn: IndexReg } // d(An,Xn)
  | { kind: 'pcidx'; expr: string; xn: IndexReg } // d(PC,Xn)
  | { kind: 'ccr' | 'sr' } // the CCR / SR registers, only as MOVE / ANDI / ORI / EORI operands
  | { kind: 'list'; mask: number } // MOVEM register list: bit0 = D0 .. bit15 = A7

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
