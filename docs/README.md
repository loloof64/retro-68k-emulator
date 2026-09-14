# TI-89 68000 Emulator - Documentation

Complete reference documentation for the TI-89 68000 Emulator project.

## 📚 Table of Contents

1. **[Getting Started](./GETTING_STARTED.md)** - Installation and first steps
2. **[Architecture](./ARCHITECTURE.md)** - Internal design and structure
3. **[Opcode Reference](./OPCODES.md)** - Complete 68000 instruction set
4. **[API Documentation](./API.md)** - Developer API reference
5. **[Memory Layout](./MEMORY.md)** - Memory map and framebuffer
6. **[Examples](./EXAMPLES.md)** - Code examples and tutorials
7. **[Installation & Distribution](./INSTALLATION.md)** - Building and installing the desktop app (Tauri)
8. **[Troubleshooting](./TROUBLESHOOTING.md)** - Common issues and solutions

## 🎯 Quick Navigation

### For Users
- Learning 68000 assembly? Start with [Getting Started](./GETTING_STARTED.md)
- Need opcode reference? See [Opcode Reference](./OPCODES.md)
- Looking for examples? Check [Examples](./EXAMPLES.md)

### For Developers
- Understanding the codebase? Read [Architecture](./ARCHITECTURE.md)
- Extending the emulator? See [API Documentation](./API.md)
- Contributing opcodes? Check [Opcode Reference](./OPCODES.md)

## 📖 Documentation Standards

All documentation follows these conventions:

- **Code blocks**: Use `\`\`\`asm` for assembly, `\`\`\`typescript` for code
- **Hex values**: Prefix with `$` (e.g., `$1000`, `$FF`)
- **Register references**: Use monospace (e.g., `D0`, `A7`)
- **Instruction syntax**: `MNEMONIC.SIZE src,dst`

## 🔄 Version Compatibility

- **Latest version**: 0.1.0 (Development)
- **Documentation updated**: 2026-09-14
- **Node.js requirement**: 16.0.0+

## 📝 Contributing to Documentation

When adding new features:
1. Update relevant `.md` files in `docs/`
2. Add examples to `examples/`
3. Include API changes in `API.md`
4. Update `CHANGELOG.md`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

**Last updated**: September 14, 2026
