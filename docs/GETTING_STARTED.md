# Getting Started

Welcome to the TI-89 68000 Emulator! This guide will help you install and run the emulator.

## Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** 7.0.0 or higher
- A modern web browser (Chrome, Firefox, Safari, or Edge)

## Installation

### 1. Clone or extract the project

```bash
cd ti89-68k-emulator
```

### 2. Install dependencies

```bash
npm install
```

This will install all required packages including React, Vite, TypeScript, and testing tools.

### 3. Start the development server

```bash
npm run dev
```

The application will automatically open in your default browser at `http://localhost:3000`.

## Your First Program

Once the emulator is running, you'll see three panels:

- **Left panel (Editor)**: Write your 68000 assembly code
- **Center panel (Debugger)**: View registers, flags, and execution state
- **Right panel (Screen)**: See your program's output on the simulated LCD screen

### Simple Example

Replace the default code with:

```asm
; Simple addition program
        ORG     $1000

START:
        MOVE.L  #50,D0          ; Load 50 into D0
        MOVE.L  #100,D1         ; Load 100 into D1
        ADD.L   D1,D0           ; D0 = D0 + D1 (result: 150)
        
        ; Display result in memory
        MOVE.L  #$40000,A0      ; A0 = framebuffer address
        MOVE.L  D0,(A0)         ; Store D0 to screen memory
        
        TRAP    #0              ; Exit program
        
        END     START
```

### Running Your Program

1. Click the **▶ Run** button to assemble and execute
2. Watch the **Debugger** panel to see registers change in real-time
3. Check the **Screen** panel for output

## Available Buttons

- **▶ Run**: Assemble and execute the program
- **⏸ Pause**: Pause execution
- **⤵ Step**: Execute one instruction at a time
- **⟲ Reset**: Clear all registers and restart

## Available Commands

```bash
npm run dev              # Start development server (port 3000)
npm run build            # Build for production
npm run test             # Run tests
npm run lint             # Check code style
npm run format           # Auto-format code
npm run type-check       # Check TypeScript types
npm run docs:pdf         # Generate PDF documentation with bookmarks
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Run program |
| `Ctrl+K` | Clear console |
| `Tab` | Indent in editor |

## Common Issues

### Port 3000 already in use

The development server defaults to port 3000. If this port is taken, Vite will automatically use the next available port.

### Build errors

Ensure you have Node.js 16+ installed:

```bash
node --version
```

If you see errors, try clearing and reinstalling:

```bash
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

- **Learn 68000 instructions**: See [Opcode Reference](./OPCODES.md)
- **Understand the architecture**: Read [Architecture](./ARCHITECTURE.md)
- **Explore examples**: Check [Examples](./EXAMPLES.md)
- **API details**: See [API Documentation](./API.md)

## Getting Help

- Check [Troubleshooting](./TROUBLESHOOTING.md)
- Review [Examples](./EXAMPLES.md)
- See the [Opcode Reference](./OPCODES.md) for instruction details

Happy coding! 🚀
