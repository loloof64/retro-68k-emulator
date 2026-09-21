# Retro 68K Emulator

## Complete Documentation & Reference Guide

---

### About This Documentation

This comprehensive guide covers the Retro 68K Emulator, a simplified retro-style Motorola 68000 CPU emulator, built for learning 68000 assembly language.

**Version**: 0.1.0  
**Updated**: September 2026  
**License**: MIT

---

### What You'll Find

- **Getting Started**: Installation and first steps
- **Architecture**: System design and internals
- **Opcode Reference**: Complete instruction set documentation
- **API Documentation**: Developer reference for extending the emulator
- **Memory Layout**: Memory organization and framebuffer details
- **Examples**: Practical code examples and tutorials
- **Troubleshooting**: Solutions to common problems

---

### Quick Start

```bash
git clone https://github.com/loloof64/retro-68k-emulator.git
cd retro-68k-emulator
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser.

---

### Features

✅ Support for ~80 68000 opcodes  
✅ Full register set (D0-D7, A0-A7)  
✅ Flag management (N, Z, V, C, X)  
✅ TRAP system for interrupts/syscalls  
✅ 320×200 color LCD display (32-bit RGBA)  
✅ Real-time debugger with register visualization  
📅 Syntax-highlighted assembly editor (planned)  

---

### Key Components

| Component | Description |
|-----------|-------------|
| **Assembler** | Tokenizes, parses, and compiles 68000 assembly |
| **CPU Emulator** | Simulates 68000 instruction execution |
| **Memory** | Addressable space with framebuffer and controller input |
| **UI** | React-based web interface with three-panel layout |

---

### For Learners

If you're learning 68000 assembly:
1. Start with [Getting Started](./GETTING_STARTED.md)
2. Explore [Examples](./EXAMPLES.md)
3. Reference [Opcode Reference](./OPCODES.md) as needed
4. Check [Troubleshooting](./TROUBLESHOOTING.md) for problems

### For Developers

If you're extending or modifying the emulator:
1. Read [Architecture](./ARCHITECTURE.md)
2. Study [API Documentation](./API.md)
3. Understand [Memory Layout](./MEMORY.md)
4. Check source code in `src/`

---

### Resources

- **Motorola 68000 Reference**: https://en.wikipedia.org/wiki/Motorola_68000
- **68000 Assembly Guide**: http://www.easy68k.com/

---

### Support

- Check [Troubleshooting](./TROUBLESHOOTING.md) for common issues
- Review [Examples](./EXAMPLES.md) for working code
- See [FAQ](#faq) below

### FAQ

**Q: Can I use this for production code?**  
A: No, this is an educational emulator. For production, use actual Motorola 68000 systems or modern alternatives.

**Q: Which 68000 variant does this emulate?**  
A: The original Motorola 68000 with a subset of its instruction set.

**Q: Can I extend the instruction set?**  
A: Yes! See [API Documentation](./API.md) for details on adding new instructions.

**Q: Is this accurate to real 68000 hardware?**  
A: It's a simplified simulation. Cycle times and advanced features are approximated for educational purposes.

---

**Happy coding! 🚀**
