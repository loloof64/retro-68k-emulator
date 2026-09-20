# A simple m68k simulation for games in assembly language

## 🛠️ Available Scripts

```bash
# Development
npm run dev          # Start Vite dev server (port 1420)
npm run build         # Build for production
npm run preview       # Preview the build

# Desktop app (Tauri)
npm run tauri:dev     # Launch as a native desktop window
npm run tauri:build   # Build a distributable installer

# Code quality
npm run lint          # ESLint
npm run format         # Prettier
npm run type-check     # TypeScript

# Tests
npm run test           # Vitest in watch mode
npm run test:ui        # Vitest with UI

# Documentation
npm run docs:pdf        # Generate PDF documentation with bookmarks
```

## 📝 Assembly Example

```asm
; Simple program: add two numbers

        ORG     $1000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #200,D1         ; D1 = 200
        ADD.L   D1,D0           ; D0 += D1 (result: 300)

        ; Write the result to memory
        MOVE.L  #$40000,A0      ; A0 = VRAM address
        MOVE.L  D0,(A0)         ; Memory[A0] = D0

        ; Exit
        TRAP    #0              ; Exit

        END     START
```

## 🏗️ Architecture

### Emulated CPU

- **Registers**: D0-D7 (data), A0-A7 (address)
- **Flags**: N, Z, V, C, X
- **Memory**: ~506KB addressable (system + user RAM, framebuffer, controller input, sound — see [docs/MEMORY.md](./docs/MEMORY.md))
- **Framebuffer**: 320×200 pixels (0x40000)
- **Controller input**: gamepad button bitmask (0x7E800)
- **Sound**: tone generator registers + `TRAP #6` (0x7E804), no audio backend wired up yet

### Supported Opcodes

To be added progressively:

- MOVE, MOVEA, MOVEQ
- ADD, SUB, MUL, DIV, CMP
- AND, OR, XOR, NOT
- BTST
- LSL, LSR, ASL, ASR, ROL, ROR
- BRA, BEQ, BNE, BLT, BLE, BGT, BGE
- JSR, RTS, TRAP
- DBRA, BCC, BCS, BVC, BVS

## 🐛 Tests

Run the tests:

```bash
npm run test
```

With UI:

```bash
npm run test:ui
```

## 📊 Development Phases

### Phase 1: Architecture (✅ Done)

- Project skeleton
- Vite/React configuration
- Base UI

### Phase 2: Assembler (✅ Done)

- Tokenizer parser
- Opcode table
- Label and symbol handling

### Phase 3: CPU Emulator (📅 Planned)

- Register simulator
- Instruction execution
- Memory management

### Phase 4: UI Polish (📅 Planned)

- Real-time visualization
- Breakpoints
- Memory inspection

## 🎓 Resources

- [Motorola 68000 Instruction Set](https://en.wikipedia.org/wiki/Motorola_68000)
- [68000 Assembly Guide](http://www.easy68k.com/)

## 📄 License

MIT

## 💬 Development Notes

See `docs/` for:

- Full opcode specification
- Assembled bytecode format
- Internal CPU architecture
- Building & distributing the desktop app (Tauri)
