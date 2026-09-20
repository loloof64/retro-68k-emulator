# Architecture

This document describes the internal architecture of the Retro 68K Emulator.

## System Overview

```
┌─────────────────────────────────────┐
│   Web UI (React/Vite)               │
├─────────────────────────────────────┤
│   Assembler Module                  │
│   - Tokenizer                       │
│   - Parser                          │
│   - Code Generator                  │
├─────────────────────────────────────┤
│   CPU Emulator Module               │
│   - Register State                  │
│   - Instruction Executor            │
│   - Flag Management                 │
├─────────────────────────────────────┤
│   Memory Module                     │
│   - RAM (256KB)                     │
│   - Framebuffer (320x200)           │
│   - Controller Input                │
│   - Sound (no audio backend yet)    │
│   - TRAP handlers                   │
└─────────────────────────────────────┘
```

## Memory Layout

```
$00000 ┌─────────────────┐
       │  System RAM     │  8 KB     (Reserved for vectors/TRAP handlers)
       │                 │
$02000 ├─────────────────┤
       │  User RAM       │  248 KB   (Program code & data)
       │                 │
$40000 ├─────────────────┤
       │  Framebuffer    │  ~244 KB  (320x200 LCD display, 32bpp)
       │                 │
$7E800 ├─────────────────┤
       │  Controller     │  4 B      (Button state bitmask)
       │  Input          │
$7E804 ├─────────────────┤
       │  Sound          │  8 B      (Tone generator — layout only, not wired yet)
$7E80C └─────────────────┘
```

## Register File

### Data Registers (D0-D7)
- 32-bit general purpose registers
- Used for arithmetic, logic, and data manipulation
- Initialized to 0

### Address Registers (A0-A7)
- 32-bit address registers
- A7 serves as the Stack Pointer (SP)
- Used for memory addressing and subroutine calls

### Status Flags
- **N** (Negative): Set if result is negative
- **Z** (Zero): Set if result is zero
- **V** (Overflow): Set if signed overflow occurred
- **C** (Carry): Set if unsigned carry/borrow occurred
- **X** (Extend): Extended bit, used in multi-precision arithmetic

These five flags are real 68000's Status Register (`SR`) low byte — its
Condition Code Register (`CCR`). This codebase never models `SR`'s high
byte: no supervisor-mode bit, no interrupt priority mask, no trace bit,
and no separate supervisor stack pointer alongside the one `A7`. A
deliberate simplification, not an oversight — this emulator runs one
program at a time, so the user/supervisor privilege boundary that byte
exists to enforce has nothing to protect here. See
`docs/OPCODES.md`'s "Why doesn't this emulator implement
RTE/STOP/RESET/MOVE SR?" for the full reasoning and exactly which
instructions it rules out.

## CPU Execution Cycle

1. **Fetch**: Read opcode from memory at PC
2. **Decode**: Identify instruction and addressing mode
3. **Execute**: Perform operation, update registers/flags
4. **Update**: Increment PC, update cycle counter

## Assembler Pipeline

```
Source Code (.asm)
      ↓
   parser.ts      (Split line: label, mnemonic, size, operands)
      ↓
   Pass 1         (Measure instructions, record label addresses)
      ↓
   Pass 2         (Encode with real labels via opcode encode fields)
      ↓
   AssembledProgram (bytecode, origin, entry, labels, lineMap)
```

Details, syntax and limits: see [Assembler](./ASSEMBLER.md).

### Label Resolution
- First pass: Collect all labels and their addresses
- Second pass: Replace label references with actual addresses

### Symbol Table
- Maps symbol names to memory addresses
- EQU directive for constants
- ORG directive for origin setting

## Instruction Execution

Each instruction execution returns the number of CPU cycles consumed:

```typescript
type InstructionHandler = (
  cpu: CPUState,
  args: any[]
) => number; // cycles
```

### Addressing Modes Supported

1. **Immediate**: `#value` - Direct value
2. **Register**: `Dn`, `An` - Register direct
3. **Register Indirect**: `(An)` - Memory at address in An
4. **Post-increment**: `(An)+` - Indirect with post-increment
5. **Pre-decrement**: `-(An)` - Indirect with pre-decrement
6. **Displacement**: `$1000` - Direct memory address
7. **Indexed**: `$1000(A0)` - Address + register offset

## TRAP System

TRAP instructions invoke system handlers:

```
TRAP #n
```

Maps to a handler table:

- **TRAP #0**: Exit program
- **TRAP #1**: Print string to console
- **TRAP #2**: Read pixel from framebuffer
- **TRAP #3**: Write pixel to framebuffer
- **TRAP #4**: Clear screen
- **TRAP #5**: Read controller state into D0
- **TRAP #6**: Play tone — writes D0-D3 into the sound registers and triggers playback (no audio backend consumes it yet)

## Component Structure

### `src/types/cpu.ts`
Type definitions for CPU state, instructions, and memory.

### `src/assembler/` *(Implemented as a library; UI wiring pending)*
Line parser, operand parser, effective-address encoder and the two-pass `assemble` driver. Instruction encoders live next to the CPU handlers, in the `encode` field of `src/cpu/opcodes.ts`.

### `src/cpu/index.ts` *(To implement)*
CPU state management and instruction execution.

### `src/ui/` *(Implemented)*
React components for the user interface.

## State Management

The emulator maintains:

```typescript
interface EmulatorState {
  cpu: CPUState;           // Register state, PC, flags
  memory: Memory;          // RAM + framebuffer
  running: boolean;        // Execution state
  breakpoints: Set<number>; // Breakpoint addresses
}
```

## Performance Considerations

- Instruction execution is deterministic
- Each instruction has a fixed cycle cost
- Memory access is O(1)
- No dynamic recompilation (simple interpretation)

## Extensibility

New instructions can be added by:

1. Defining the opcode encoding
2. Implementing the handler function
3. Registering in the opcode table
4. Adding tests

Example pattern for a hypothetical `NEWOP` instruction:

```typescript
const opcodeHandlers = {
  'NEWOP': (cpu: CPUState, args: any[]) => {
    // Implementation
    return 4; // 4 cycles
  }
}
```

---

See [API Documentation](./API.md) for detailed function signatures.
