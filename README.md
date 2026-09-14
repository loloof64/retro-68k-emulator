# TI-89 68000 Emulator

Un émulateur 68000 simplifié inspiré par la calculatrice TI-89, avec interface web interactive pour apprendre l'assembleur Motorola 68000.

## 🎯 Objectifs

- ✅ Support de la plupart des opcodes 68000
- ✅ Simulation complète des registres (D0-D7, A0-A7)
- ✅ Gestion des drapeaux (N, Z, V, C, X)
- ✅ Support des TRAP et interruptions
- ✅ Écran LCD noir/blanc 320×200
- ✅ Déboguer pas-à-pas avec visualisation en temps réel
- ✅ Éditeur assembleur intégré

## 📦 Prérequis

- Node.js 16+
- npm ou yarn
- Un navigateur moderne (Chrome, Firefox, Safari, Edge)

## 🚀 Installation et Lancement

### 1. Initialiser le projet

```bash
cd ti89-68k-emulator
npm install
```

### 2a. Mode navigateur (développement rapide)

```bash
npm run dev
```

Le navigateur devrait s'ouvrir automatiquement sur `http://localhost:3000`

### 2b. Mode application desktop (Tauri)

Pour lancer dans une vraie fenêtre d'application native (nécessite Rust, voir `docs/INSTALLATION.md`) :

```bash
npm run tauri:dev
```

Pour générer un exécutable/installeur distribuable (`.msi`, `.dmg`, `.deb`, `.AppImage`...) :

```bash
npm run tauri:build
```

👉 Voir **[docs/INSTALLATION.md](./docs/INSTALLATION.md)** pour le détail complet : prérequis par OS, build, installation sur une autre machine, partage, désinstallation.

### 3. Éditer du code assembleur

- Panel gauche : écrivez votre code 68000
- Panel centre : débogeur et registres
- Panel droit : écran LCD de simulation

## 📂 Structure du projet

```
ti89-68k-emulator/
├── src/
│   ├── components/          # Composants React
│   │   ├── Editor.tsx      # Éditeur d'assembleur
│   │   ├── Debugger.tsx    # Visualiseur de registres
│   │   ├── Screen.tsx      # Écran LCD simulé
│   │   └── *.css
│   ├── assembler/          # Parser et assembleur
│   │   └── index.ts        # À implémenter
│   ├── cpu/                # Émulateur CPU
│   │   └── index.ts        # À implémenter
│   ├── types/              # Définitions TypeScript
│   │   └── cpu.ts          # Types du CPU
│   ├── main.tsx            # Point d'entrée React
│   ├── App.tsx             # Composant principal
│   └── index.css           # Styles globaux
├── index.html              # Template HTML
├── package.json            # Dépendances
├── tsconfig.json           # Config TypeScript
├── vite.config.ts          # Config Vite
├── vitest.config.ts        # Config tests
└── README.md              # Ce fichier
```

## 🛠️ Scripts disponibles

```bash
# Développement
npm run dev          # Démarre le serveur Vite (port 3000)
npm run build        # Build pour production
npm run preview      # Préview du build

# Qualité de code
npm run lint         # ESLint
npm run format       # Prettier
npm run type-check   # TypeScript

# Tests
npm run test         # Vitest en mode watch
npm run test:ui      # Vitest avec UI
```

## 📝 Exemple d'assembleur

```asm
; Program simple : Additionner deux nombres

        ORG     $1000

START:
        MOVE.L  #100,D0         ; D0 = 100
        MOVE.L  #200,D1         ; D1 = 200
        ADD.L   D1,D0           ; D0 += D1 (résultat: 300)
        
        ; Écrire le résultat en mémoire
        MOVE.L  #$40000,A0      ; A0 = adresse VRAM
        MOVE.L  D0,(A0)         ; Mémoire[A0] = D0
        
        ; Terminer
        TRAP    #0              ; Exit
        
        END     START
```

## 🏗️ Architecture

### CPU Emulé
- **Registres** : D0-D7 (données), A0-A7 (adresse)
- **Drapeaux** : N, Z, V, C, X
- **Mémoire** : 64KB adressable
- **Framebuffer** : 320×200 pixels (0x40000)

### Opcodes Supportés
À ajouter progressivement :
- MOVE, MOVEA, MOVEQ
- ADD, SUB, MUL, DIV, CMP
- AND, OR, XOR, NOT
- LSL, LSR, ASL, ASR, ROL, ROR
- BRA, BEQ, BNE, BLT, BLE, BGT, BGE
- JSR, RTS, TRAP
- DBRA, BCC, BCS, BVC, BVS

## 🐛 Tests

Exécuter les tests :
```bash
npm run test
```

Avec UI :
```bash
npm run test:ui
```

## 📊 Phases de développement

### Phase 1 : Architecture (✅ Terminée)
- Skeleton du projet
- Configuration Vite/React
- UI de base

### Phase 2 : Assembleur (🔄 En cours)
- Parser tokenizer
- Table d'opcodes
- Gestion des labels et symboles

### Phase 3 : CPU Emulator (📅 Planifiée)
- Simulateur registres
- Exécution instructions
- Gestion mémoire

### Phase 4 : UI Polish (📅 Planifiée)
- Visualisation en temps réel
- Breakpoints
- Inspection mémoire

## 🎓 Ressources

- [Motorola 68000 Instruction Set](https://en.wikipedia.org/wiki/Motorola_68000)
- [68000 Assembly Guide](http://www.easy68k.com/)
- [TI-89 Developer](https://www.ti89.com/)

## 📄 License

MIT

## 💬 Notes de développement

Voir `docs/` pour :
- Spécification complète des opcodes
- Format du bytecode assemblé
- Architecture interne du CPU
