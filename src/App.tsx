import { useEffect, useRef, useState } from 'react';
import './App.css';
import Editor from './components/Editor';
import Debugger from './components/Debugger';
import Screen from './components/Screen';
import Controller from './components/Controller';
import { SystemMemory } from './memory';
import LanguageSelect from './components/LanguageSelect';
import { remapBreakpoints } from './breakpoints';
import { readMarks, writeMarks } from './marks';
import { translate, useI18n } from './i18n';
import { examplesFor } from './examples';
import { inTauri, openSource, saveSource } from './sourceFile';
import { initHistory, pushHistory, undo as undoHistory, redo as redoHistory, currentValue } from './history';

export default function App() {
  const { t, locale } = useI18n();
  const [asmCode, setAsmCode] = useState<string>(() => translate(locale, 'sample.program'));
  const [history, setHistory] = useState(() => initHistory(asmCode));
  // -Infinity, not Date.now(): the very first push after mount (or after
  // loadSource resets it below) must never coalesce, or it would overwrite
  // the just-loaded baseline instead of recording the edit as its own step.
  const lastPushAt = useRef(-Infinity);

  const [isRunning, setIsRunning] = useState(false);
  const [currentLine, setCurrentLine] = useState<number>();
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const toggleBreakpoint = (line: number) =>
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (!next.delete(line)) next.add(line);
      return next;
    });
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const toggleBookmark = (line: number) =>
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (!next.delete(line)) next.add(line);
      return next;
    });
  // Full path of the file being edited; only known for files opened/saved
  // through the native dialogs (Tauri), and only those keep their marks.
  const [filePath, setFilePath] = useState<string>();
  useEffect(() => {
    if (filePath) writeMarks(filePath, { bookmarks, breakpoints });
  }, [filePath, bookmarks, breakpoints]);
  // Shared by user edits and undo/redo: remaps breakpoints/bookmarks/the
  // current-line marker against the outgoing source, then swaps it in.
  const applyCode = (code: string) => {
    setBreakpoints((prev) => remapBreakpoints(prev, asmCode, code));
    setBookmarks((prev) => remapBreakpoints(prev, asmCode, code));
    setCurrentLine((line) => (line === undefined ? line : [...remapBreakpoints(new Set([line]), asmCode, code)][0]));
    setAsmCode(code);
  };
  const onEditorChange = (code: string) => {
    applyCode(code);
    const now = Date.now();
    // Read+update the ref before scheduling the state update: React may not
    // invoke this updater until after a following keystroke's handler has
    // already run, by which point lastPushAt.current would otherwise hold
    // that later keystroke's timestamp instead of this one's.
    const prevPushAt = lastPushAt.current;
    lastPushAt.current = now;
    setHistory((h) => pushHistory(h, code, now, prevPushAt));
  };
  // The app's own undo/redo stack (see ./history.ts) rather than the
  // browser's native text-field undo: Ctrl+Z/Ctrl+Y never reach that one in
  // the Tauri desktop build.
  const doUndo = () => {
    const next = undoHistory(history);
    if (next === history) return;
    setHistory(next);
    applyCode(currentValue(next));
  };
  const doRedo = () => {
    const next = redoHistory(history);
    if (next === history) return;
    setHistory(next);
    applyCode(currentValue(next));
  };
  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;
  const loadSource = (code: string, path?: string) => {
    const marks = path ? readMarks(path, code.split('\n').length) : undefined;
    setAsmCode(code);
    setHistory(initHistory(code));
    lastPushAt.current = -Infinity;
    setFilePath(path);
    setBreakpoints(marks?.breakpoints ?? new Set());
    setBookmarks(marks?.bookmarks ?? new Set());
    setCurrentLine(undefined);
  };
  const openFile = async (file?: File) => file && loadSource(await file.text());
  const saveFile = () => {
    if (inTauri) return void saveSource(asmCode).then((p) => p && setFilePath(p)).catch((e) => alert(String(e)));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([asmCode], { type: 'text/plain' }));
    a.download = 'program.asm';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const [frame, setFrame] = useState(0); // bumped to make Screen repaint

  // Not React state on purpose: the controller reports button changes up to
  // 60x/second, and nothing here needs a re-render when they happen — only
  // the emulator's own memory needs to see them (see docs/MEMORY.md).
  const memoryRef = useRef<SystemMemory | null>(null);
  if (memoryRef.current === null) {
    memoryRef.current = new SystemMemory();
  }

  return (
    <div className="app">
      <div className="container">
        <div className="panel editor-panel">
          <h2>{t('panel.editor')}</h2>
          <select
            className="example-select"
            value=""
            disabled={isRunning}
            onChange={(e) => {
              const example = examplesFor(locale).find((x) => x.id === e.target.value);
              if (!example) return;
              loadSource(example.code);
            }}
          >
            <option value="">{t('examples.load')}</option>
            {examplesFor(locale).map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
          <label
            className="file-button"
            onClick={
              inTauri
                ? (e) => {
                    e.preventDefault();
                    if (!isRunning)
                      openSource()
                        .then((f) => f && loadSource(f.code, f.path))
                        .catch((e) => alert(String(e)));
                  }
                : undefined
            }
          >
            {t('file.open')}
            <input
              type="file"
              accept=".asm,.s,.txt,text/plain"
              hidden
              disabled={isRunning}
              onChange={(e) => {
                openFile(e.target.files?.[0]);
                e.target.value = ''; // allow re-opening the same file
              }}
            />
          </label>
          <button className="file-button" onClick={saveFile}>
            {t('file.save')}
          </button>
          <button className="file-button" onClick={doUndo} disabled={!canUndo} title={t('history.undo')}>
            {t('history.undo')}
          </button>
          <button className="file-button" onClick={doRedo} disabled={!canRedo} title={t('history.redo')}>
            {t('history.redo')}
          </button>
          <Editor
            code={asmCode}
            onChange={onEditorChange}
            currentLine={currentLine}
            breakpoints={breakpoints}
            onToggleBreakpoint={toggleBreakpoint}
            bookmarks={bookmarks}
            onToggleBookmark={toggleBookmark}
            onUndo={doUndo}
            onRedo={doRedo}
          />
        </div>

        <div className="panel debugger-panel">
          <h2>{t('panel.debugger')}</h2>
          <Debugger
            code={asmCode}
            memory={memoryRef.current}
            breakpoints={breakpoints}
            currentLine={currentLine}
            onLineChange={setCurrentLine}
            isRunning={isRunning}
            onRunningChange={setIsRunning}
            onFrame={() => setFrame((f) => f + 1)}
          />
        </div>

        <div className="panel screen-panel">
          <h2>{t('panel.screen')}</h2>
          <Screen memory={memoryRef.current} frame={frame} />
          <Controller onButtonStateChange={(mask) => memoryRef.current?.setButtonState(mask)} />
          <LanguageSelect />
        </div>
      </div>
    </div>
  );
}
