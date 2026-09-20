# API Documentation

Detailed API reference for extending and using the Retro 68K Emulator programmatically.

## CPU Module

### CPUState Interface

```typescript
interface CPUState {
  registers: Uint32Array;    // D0-D7, A0-A7 (16 x 32-bit)
  pc: number;                // Program Counter
  sp: number;                // Stack Pointer (A7)
  status: StatusFlags;       // CPU flags
  halted: boolean;           // Execution halted
  cycles: number;            // Cycle counter
}
```

### Register Enumeration

```typescript
enum Register {
  D0 = 0,  D1 = 1,  D2 = 2,  D3 = 3,
  D4 = 4,  D5 = 5,  D6 = 6,  D7 = 7,
  A0 = 8,  A1 = 9,  A2 = 10, A3 = 11,
  A4 = 12, A5 = 13, A6 = 14, A7 = 15
}
```

### StatusFlags Interface

```typescript
interface StatusFlags {
  C: boolean;  // Carry
  V: boolean;  // Overflow
  Z: boolean;  // Zero
  N: boolean;  // Negative
  X: boolean;  // Extend
}
```

## Assembler Module

### Token Interface

```typescript
interface Token {
  type: 'mnemonic' | 'register' | 'number' | 'label' | 'comma' 
       | 'lparen' | 'rparen' | 'symbol';
  value: string;
  line: number;
  column: number;
}
```

### Instruction Interface

```typescript
interface Instruction {
  opcode: number;           // Numeric opcode
  mnemonic: string;         // e.g., "MOVE"
  args: any[];              // Operands
  size: 'byte' | 'word' | 'long';
}
```

### AssembledProgram Interface

```typescript
interface AssembledProgram {
  bytecode: Uint8Array;            // Machine code
  origin: number;                  // Address bytecode[0] belongs at (ORG)
  entry: number;                   // Start address (END label, else origin)
  labels: Map<string, number>;     // Label -> address
  symbols: Map<string, number>;    // Symbol -> value
  lineMap: Map<number, number>;    // Bytecode offset -> source line
}
```

## Memory Module

### Memory Interface

```typescript
interface Memory {
  read8(address: number): number;
  read16(address: number): number;
  read32(address: number): number;
  
  write8(address: number, value: number): void;
  write16(address: number, value: number): void;
  write32(address: number, value: number): void;
}
```

### Framebuffer Access

The framebuffer is located at memory offset `$40000` and is 320×200 pixels.

**Reading a pixel**:
```typescript
const pixelValue = memory.read32(0x40000 + offset);
```

**Writing a pixel**:
```typescript
memory.write32(0x40000 + offset, color);
```

**Pixel format**: 32-bit RGBA (0xRRGGBBAA)

## Emulator Module

### EmulatorState Interface

```typescript
interface EmulatorState {
  cpu: CPUState;              // CPU state
  memory: Memory;             // Memory subsystem
  running: boolean;           // Execution flag
  breakpoints: Set<number>;   // Breakpoint addresses
}
```

## OpcodeDefinition Interface

For implementing new instructions:

```typescript
interface OpcodeDefinition {
  mnemonic: string;
  encoding: string;           // Bit pattern string
  size: 'byte' | 'word' | 'long' | 'variable';
  handler: (cpu: CPUState, args: any[]) => number;  // Returns cycles
}
```

### Implementing a New Opcode

```typescript
// Example: Simple opcode that doubles a register
const doubleOpcode: OpcodeDefinition = {
  mnemonic: 'DOUBLE',
  encoding: '1101RRRRXX000000',  // Where R = register, X = size
  size: 'long',
  handler: (cpu: CPUState, args: [Register]) => {
    const reg = args[0];
    const value = cpu.registers[reg];
    cpu.registers[reg] = (value * 2) >>> 0;  // 32-bit
    
    // Update flags
    cpu.status.Z = cpu.registers[reg] === 0;
    cpu.status.N = (cpu.registers[reg] & 0x80000000) !== 0;
    
    return 4;  // Return cycle count
  }
};
```

## TRAP Handler Type

```typescript
type TrapHandler = (
  cpu: CPUState,
  memory: Memory,
  trapNum: number
) => void;
```

### Implementing a TRAP Handler

```typescript
const exitTrap: TrapHandler = (cpu, memory, trapNum) => {
  if (trapNum === 0) {
    cpu.halted = true;
  }
};

const printStringTrap: TrapHandler = (cpu, memory, trapNum) => {
  if (trapNum === 1) {
    // A0 contains pointer to null-terminated string
    let addr = cpu.registers[Register.A0];
    let str = '';
    
    while (true) {
      const char = memory.read8(addr);
      if (char === 0) break;
      str += String.fromCharCode(char);
      addr++;
    }
    
    console.log(str);
  }
};
```

## React Component Props

### Editor Component

```typescript
interface EditorProps {
  code: string;
  onChange: (code: string) => void;
}
```

### Debugger Component

```typescript
interface DebuggerProps {
  code: string;
  isRunning: boolean;
  onRunningChange: (running: boolean) => void;
}
```

### Screen Component

```typescript
interface ScreenProps {
  framebuffer?: Uint32Array;  // Optional framebuffer to display
  onPixelClick?: (x: number, y: number) => void;
}
```

## Helper Functions

### Flag Update Utility

```typescript
function updateFlags(
  cpu: CPUState,
  result: number,
  size: 'byte' | 'word' | 'long'
): void {
  const mask = size === 'byte' ? 0xFF 
             : size === 'word' ? 0xFFFF 
             : 0xFFFFFFFF;
  
  const masked = result & mask;
  cpu.status.Z = masked === 0;
  cpu.status.N = (masked & (mask >> 1 + 1)) !== 0;
}
```

### Register Extraction from Opcode

```typescript
function extractRegister(opcode: number, position: number): Register {
  return (opcode >> position) & 0xF as Register;
}
```

## TypeScript Type Checking

The project uses strict TypeScript with these key rules:

- No implicit `any`
- No unused variables
- No unused parameters
- Strict null checks enabled

Always provide type annotations for exported functions and classes.

## Error Handling

Common error scenarios:

```typescript
// Invalid instruction
throw new Error(`Unknown instruction: ${mnemonic}`);

// Out of bounds memory access
if (address < 0 || address >= 0x50000) {
  throw new Error(`Memory access out of bounds: $${address.toString(16)}`);
}

// Invalid register
if (register < 0 || register > 15) {
  throw new Error(`Invalid register: ${register}`);
}
```

## Performance Notes

- Memory access is simulated with direct array indexing (O(1))
- No cycle-accurate timing for complex instructions
- No memory caching or prefetching
- Stack is implemented as part of general memory

## Testing

Use Vitest for unit testing:

```typescript
import { describe, it, expect } from 'vitest';

describe('CPU ADD instruction', () => {
  it('should add two registers', () => {
    const cpu = createCPU();
    cpu.registers[Register.D0] = 100;
    cpu.registers[Register.D1] = 50;
    
    const cycles = addHandler(cpu, [Register.D1, Register.D0]);
    
    expect(cpu.registers[Register.D0]).toBe(150);
    expect(cpu.status.Z).toBe(false);
    expect(cycles).toBe(4);
  });
});
```

---

See [Architecture](./ARCHITECTURE.md) for system design overview.
