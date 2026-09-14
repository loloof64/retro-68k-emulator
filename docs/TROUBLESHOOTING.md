# Troubleshooting

Solutions for common problems when using the TI-89 68000 Emulator.

## Installation Issues

### "npm: command not found"

**Problem**: Node.js or npm is not installed.

**Solution**:
1. Download Node.js from https://nodejs.org/
2. Install the LTS version
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### "npm ERR! permission denied"

**Problem**: Permission issues during npm install.

**Solution**: Use a node version manager instead:
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
npm install
```

### "Port 3000 already in use"

**Problem**: Another application is using port 3000.

**Solution**: 
- The dev server will automatically try the next port (3001, 3002, etc.)
- Or kill the process using port 3000:
  ```bash
  # Linux/Mac
  lsof -i :3000
  kill -9 <PID>
  
  # Windows
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```

## Assembly Errors

### "Unknown instruction: MOVEQ"

**Problem**: The assembler doesn't recognize the instruction.

**Solution**: Check spelling:
- Correct: `MOVEQ`
- Wrong: `MOVE Q`, `MOVQ`, `MOVEQUEUE`

### "Invalid register: RO"

**Problem**: Register name is misspelled or invalid.

**Solution**: Valid registers are:
- Data: D0-D7
- Address: A0-A7
- **Not valid**: R0, R1, RO, AX, etc.

### "Label not found: LOOP"

**Problem**: Referenced label doesn't exist or has typo.

**Solution**:
1. Check label spelling matches branch target
2. Ensure label is defined before use (usually)
3. Labels are case-sensitive in some assemblers

```asm
; Wrong - reference before definition
BRA     LOOP

; Correct
LOOP:
  MOVE.L  D0,D1
```

### "Syntax error: expected comma"

**Problem**: Missing comma or incorrect instruction format.

**Solution**: Check instruction syntax:
```asm
; Wrong
MOVE.L D0 D1

; Correct
MOVE.L D0,D1
```

### "Invalid opcode size: MOVE.Q"

**Problem**: Instruction doesn't support specified size.

**Solution**: Valid sizes vary by instruction:
- MOVE: .B, .W, .L
- MOVEQ: no size (always 8-bit immediate)
- DBRA: no size modifier

## Execution Issues

### "Program doesn't exit / hangs"

**Problem**: Program gets stuck in infinite loop.

**Solution**:
1. Click **Pause** button
2. Check for infinite loops:
   ```asm
   LOOP:
     ; ... code ...
     BRA   LOOP    ; Infinite loop!
   ```
3. Use DBRA instead of infinite BRA

### "Registers don't change"

**Problem**: Register values aren't updating as expected.

**Solution**:
1. Check register size:
   ```asm
   MOVE.W  #100,D0   ; Only changes low word
   MOVE.L  #100,D0   ; Changes all 32 bits
   ```
2. Verify addressing mode:
   ```asm
   MOVE.L  #100,D0   ; Correct - load constant
   MOVE.L  100,D0    ; Wrong - load from address 100
   ```

### "Stack corruption / crashes"

**Problem**: Program crashes or produces incorrect results.

**Causes**:
1. Stack overflow (A7 goes below $02000)
2. Incorrect PUSH/POP pairing
3. Not saving registers in subroutines

**Solution**:
```asm
MY_FUNCTION:
  ; Save registers
  MOVE.L  D0,-(A7)
  MOVE.L  D1,-(A7)
  
  ; ... do work ...
  
  ; Restore registers
  MOVE.L  (A7)+,D1
  MOVE.L  (A7)+,D0
  RTS
```

### "Wrong calculation result"

**Problem**: Arithmetic gives unexpected values.

**Causes**:
1. Overflow/underflow
2. Signed vs unsigned confusion
3. Register width issues

**Solution**:
```asm
; Be explicit about operations
MULS    #-1,D0      ; Signed multiply
MULU    #-1,D0      ; Unsigned multiply
```

## Display Issues

### "Screen is completely black"

**Problem**: Framebuffer not working.

**Solution**:
1. Verify framebuffer address is $40000
2. Check pixel format:
   ```asm
   MOVE.L  #$FFFFFF,(A0)  ; White = full RGB
   MOVE.L  #$000000,(A0)  ; Black = no RGB
   ```
3. Ensure A0 points to framebuffer

### "Pixels are wrong color"

**Problem**: Colors don't display correctly.

**Solution**: Color format is RGBA (0xRRGGBBAA):
```asm
MOVE.L  #$FFFFFF,D0   ; White
MOVE.L  #$FF0000,D0   ; Red
MOVE.L  #$00FF00,D0   ; Green
MOVE.L  #$0000FF,D0   ; Blue
```

### "Screen glitching / tearing"

**Problem**: Graphical artifacts appear.

**Causes**:
1. Writing outside framebuffer bounds
2. Address calculation errors
3. Race conditions (rare)

**Solution**:
```asm
; Verify address is within bounds
MOVE.L  #320,D0      ; Screen width
MOVE.L  #200,D1      ; Screen height
MULU.W  D1,D0        ; D0 = width * height
MULU.W  #4,D0        ; D0 *= 4 (bytes per pixel)
; D0 should not exceed $20000 (128KB)
```

## Performance Issues

### "Program runs too slowly"

**Problem**: Emulation seems sluggish.

**Possible causes**:
1. Complex loops executing millions of iterations
2. Browser UI blocking
3. Inefficient code patterns

**Tips for optimization**:
1. Use shifts instead of multiply:
   ```asm
   ASL.L   #2,D0      ; Faster than MULU #4,D0
   ```
2. Use MOVEQ for small constants:
   ```asm
   MOVEQ   #10,D0     ; Faster than MOVE.L #10,D0
   ```
3. Minimize memory access

## Browser Issues

### "Page becomes unresponsive"

**Problem**: Browser freezes or becomes slow.

**Causes**:
1. Very long running program
2. JavaScript errors

**Solution**:
1. Click **Pause** button to stop execution
2. Check browser console for errors (F12)
3. Simplify program or reduce iteration count

### "Syntax highlighting breaks"

**Problem**: Code editor doesn't color-code properly.

**Solution**: 
1. Try refreshing the page (Ctrl+R or Cmd+R)
2. Clear browser cache
3. Try a different browser

## Documentation PDF Issues

### "PDF generation failed"

**Problem**: Can't generate documentation PDF.

**Solution**: Ensure required tools are installed:

```bash
# Option 1: Using Puppeteer (included)
npm install -D puppeteer
npm run docs:pdf

# Option 2: Using pandoc
npm install -g pandoc
npm run docs:pdf:pandoc
```

## Getting More Help

If you can't find a solution:

1. **Check examples**: Look at working examples in `examples/`
2. **Review documentation**: See relevant docs/
3. **Step through code**: Use debugger's Step button
4. **Add debug output**: Use TRAP #1 to print intermediate values
5. **Simplify**: Create minimal test case

## Reporting Issues

When reporting a bug, include:
1. The assembly code that fails
2. Expected vs actual results
3. Browser type and version
4. Steps to reproduce
5. Screenshots if applicable

---

For detailed reference, see [Opcode Reference](./OPCODES.md) and [API Documentation](./API.md).
