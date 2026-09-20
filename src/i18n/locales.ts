export const en = {
  language: 'Language',
  'panel.editor': 'Assembler',
  'panel.debugger': 'Debugger',
  'panel.screen': 'LCD screen',
  run: 'Run',
  pause: 'Pause',
  step: 'Step',
  reset: 'Reset',
  speed: 'Speed',
  'speed.unit': 'instr./frame',
  'speed.title': 'Instructions executed per frame (Run only)',
  'error.line': 'Line {line}: {message}',
  'error.runtime': 'Runtime error: {message}',
  pc: 'PC',
  cycles: 'Cycles',
  line: 'Line',
  halted: 'Program finished',
  'registers.data': 'Data registers',
  'registers.address': 'Address registers',
  flags: 'Flags',
  'decimal.title': '{unsigned} (signed: {signed})',
  'screen.resolution': 'Resolution: 320×200',
  'screen.colors': 'Colors: 32-bit RGBA',
  'gamepad.detected': '🎮 Gamepad detected',
  'gamepad.virtual': 'Virtual buttons',
  'sample.program': `; Retro 68K Assembly Example
; Simple program to test the emulator

        ORG     $2000           ; Origin at $2000

START:
        MOVE.L  #100,D0         ; Load 100 into D0
        MOVE.L  #200,D1         ; Load 200 into D1
        ADD.L   D1,D0           ; D0 += D1
        
        ; Draw a white line (320 pixels, colors are $RRGGBBAA)
        MOVE.L  #$40000,A0      ; Framebuffer base
        MOVE.W  #319,D2         ; Loop counter: 320 iterations
LINE:
        MOVE.L  #$FFFFFFFF,(A0)+ ; White pixel, then A0 += 4
        DBRA    D2,LINE         ; Repeat until D2 wraps to -1

        ; Halt
        TRAP    #0              ; Exit
        
        END     START
`,
}

export type MessageKey = keyof typeof en

export const fr: Record<MessageKey, string> = {
  language: 'Langue',
  'panel.editor': 'Assembleur',
  'panel.debugger': 'Débogueur',
  'panel.screen': 'Écran LCD',
  run: 'Exécuter',
  pause: 'Pause',
  step: 'Pas à pas',
  reset: 'Réinitialiser',
  speed: 'Vitesse',
  'speed.unit': 'instr./image',
  'speed.title': 'Instructions exécutées par image affichée (Exécuter uniquement)',
  'error.line': 'Ligne {line} : {message}',
  'error.runtime': "Erreur d'exécution : {message}",
  pc: 'PC',
  cycles: 'Cycles',
  line: 'Ligne',
  halted: 'Programme terminé',
  'registers.data': 'Registres de données',
  'registers.address': "Registres d'adresse",
  flags: 'Indicateurs',
  'decimal.title': '{unsigned} (signé : {signed})',
  'screen.resolution': 'Résolution : 320×200',
  'screen.colors': 'Couleurs : RGBA 32 bits',
  'gamepad.detected': '🎮 Manette détectée',
  'gamepad.virtual': 'Boutons virtuels',
  'sample.program': `; Exemple d'assembleur Retro 68K
; Programme simple pour tester l'émulateur

        ORG     $2000           ; Origine à $2000

START:
        MOVE.L  #100,D0         ; Charge 100 dans D0
        MOVE.L  #200,D1         ; Charge 200 dans D1
        ADD.L   D1,D0           ; D0 += D1
        
        ; Dessine une ligne blanche (320 pixels, couleurs au format $RRGGBBAA)
        MOVE.L  #$40000,A0      ; Base du framebuffer
        MOVE.W  #319,D2         ; Compteur de boucle : 320 itérations
LINE:
        MOVE.L  #$FFFFFFFF,(A0)+ ; Pixel blanc, puis A0 += 4
        DBRA    D2,LINE         ; Répète jusqu'à ce que D2 passe à -1

        ; Arrêt
        TRAP    #0              ; Sortie
        
        END     START
`,
}

export const es: Record<MessageKey, string> = {
  language: 'Idioma',
  'panel.editor': 'Ensamblador',
  'panel.debugger': 'Depurador',
  'panel.screen': 'Pantalla LCD',
  run: 'Ejecutar',
  pause: 'Pausa',
  step: 'Paso',
  reset: 'Reiniciar',
  speed: 'Velocidad',
  'speed.unit': 'instr./fotograma',
  'speed.title': 'Instrucciones ejecutadas por fotograma (solo Ejecutar)',
  'error.line': 'Línea {line}: {message}',
  'error.runtime': 'Error de ejecución: {message}',
  pc: 'PC',
  cycles: 'Ciclos',
  line: 'Línea',
  halted: 'Programa terminado',
  'registers.data': 'Registros de datos',
  'registers.address': 'Registros de direcciones',
  flags: 'Indicadores',
  'decimal.title': '{unsigned} (con signo: {signed})',
  'screen.resolution': 'Resolución: 320×200',
  'screen.colors': 'Colores: RGBA de 32 bits',
  'gamepad.detected': '🎮 Mando detectado',
  'gamepad.virtual': 'Botones virtuales',
  'sample.program': `; Ejemplo de ensamblador Retro 68K
; Programa sencillo para probar el emulador

        ORG     $2000           ; Origen en $2000

START:
        MOVE.L  #100,D0         ; Carga 100 en D0
        MOVE.L  #200,D1         ; Carga 200 en D1
        ADD.L   D1,D0           ; D0 += D1
        
        ; Dibuja una línea blanca (320 píxeles, colores en formato $RRGGBBAA)
        MOVE.L  #$40000,A0      ; Base del framebuffer
        MOVE.W  #319,D2         ; Contador del bucle: 320 iteraciones
LINE:
        MOVE.L  #$FFFFFFFF,(A0)+ ; Píxel blanco, luego A0 += 4
        DBRA    D2,LINE         ; Repite hasta que D2 pase a -1

        ; Detener
        TRAP    #0              ; Salir
        
        END     START
`,
}

export const LOCALES = { en, fr, es }
export type Locale = keyof typeof LOCALES
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', es: 'Español' }
