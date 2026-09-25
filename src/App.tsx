import { Fragment, useEffect, useRef, useState } from 'react';
import './App.css';
import Editor, { EditorHandle } from './components/Editor';
import Debugger from './components/Debugger';
import Screen from './components/Screen';
import Controller from './components/Controller';
import { SystemMemory } from './memory';
import LanguageSelect from './components/LanguageSelect';
import { remapBreakpoints } from './breakpoints';
import { readMarks, writeMarks } from './marks';
import { translate, useI18n } from './i18n';
import { examplesFor } from './examples';
import { inTauri, openSource, saveSourceAs, writeSource, confirmDiscard } from './sourceFile';
import { initHistory, pushHistory, undo as undoHistory, redo as redoHistory, currentValue, hasEdits } from './history';
import { charCodeForKey, isEditableTarget } from './keyboard';
import {
  FolderOpenIcon,
  SaveIcon,
  SaveAsIcon,
  UndoIcon,
  RedoIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  MenuIcon,
} from './icons';

export default function App() {
  const { t, locale } = useI18n();
  const [asmCode, setAsmCode] = useState<string>(() => translate(locale, 'sample.program'));
  const [history, setHistory] = useState(() => initHistory(asmCode));
  // -Infinity, not Date.now(): the very first push after mount (or after
  // loadSource resets it below) must never coalesce, or it would overwrite
  // the just-loaded baseline instead of recording the edit as its own step.
  const lastPushAt = useRef(-Infinity);
  // The last loaded/saved content, so isDirty is a plain comparison rather
  // than a flag to keep in sync by hand — undoing back to it, for example,
  // is "clean" again with no extra bookkeeping.
  const [savedCode, setSavedCode] = useState(asmCode);
  const isDirty = asmCode !== savedCode;

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
  // through the native dialogs (Tauri), and only those keep their marks or
  // allow a direct Save (an example or the built-in default has nowhere to
  // write to, so only Save As is offered for those).
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
    setSavedCode(code);
    setHistory(initHistory(code));
    lastPushAt.current = -Infinity;
    setFilePath(path);
    setBreakpoints(marks?.breakpoints ?? new Set());
    setBookmarks(marks?.bookmarks ?? new Set());
    setCurrentLine(undefined);
  };
  // Guards every action that would throw away the current buffer (loading
  // an example, opening a different file): true means it's fine to proceed,
  // either because nothing would be lost or because the user said to
  // discard it anyway. Also confirms when asmCode matches savedCode but
  // there's undo/redo history beyond the initial load (e.g. edited, then
  // undid back to the original) — loading something else would silently
  // throw away that history, which is its own kind of lost work even
  // though the content itself isn't currently dirty.
  const confirmDiscardIfDirty = () =>
    (!isDirty && !hasEdits(history)) || confirmDiscard(t('file.discardConfirm'));
  const loadExample = async (id: string) => {
    const example = examplesFor(locale).find((x) => x.id === id);
    if (example && (await confirmDiscardIfDirty())) loadSource(example.code);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  // Icon-only toolbar's text fallback: a dropdown listing the same actions
  // by full label. Closes on outside click or Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);
  const openFileTauri = () => {
    if (isRunning) return;
    openSource()
      .then(async (f) => {
        if (f && (await confirmDiscardIfDirty())) loadSource(f.code, f.path);
      })
      .catch((e) => alert(String(e)));
  };
  const openFileBrowser = async (file?: File) => {
    if (file && (await confirmDiscardIfDirty())) loadSource(await file.text());
  };
  // Direct write to the already-known path; disabled (button + shortcut)
  // whenever there isn't one, e.g. an example or the built-in default.
  const canSaveDirect = filePath !== undefined;
  const saveFile = () => {
    if (!filePath || isRunning) return;
    writeSource(filePath, asmCode)
      .then(() => setSavedCode(asmCode))
      .catch((e) => alert(String(e)));
  };
  const saveFileAs = () => {
    if (isRunning) return;
    if (inTauri) {
      saveSourceAs(asmCode)
        .then((p) => {
          if (p) {
            setFilePath(p);
            setSavedCode(asmCode);
          }
        })
        .catch((e) => alert(String(e)));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([asmCode], { type: 'text/plain' }));
    a.download = 'program.asm';
    a.click();
    URL.revokeObjectURL(a.href);
    setSavedCode(asmCode);
  };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        if (isRunning) return;
        if (inTauri) openFileTauri();
        else fileInputRef.current?.click();
      } else if (key === 's') {
        e.preventDefault();
        if (e.shiftKey) saveFileAs();
        else saveFile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  const [frame, setFrame] = useState(0); // bumped to make Screen repaint

  // Not React state on purpose: the controller reports button changes up to
  // 60x/second, and nothing here needs a re-render when they happen — only
  // the emulator's own memory needs to see them (see docs/MEMORY.md).
  const memoryRef = useRef<SystemMemory | null>(null);
  if (memoryRef.current === null) {
    memoryRef.current = new SystemMemory();
  }

  // Feeds the running program's keyboard queue (TRAP #8) - captured
  // globally so it works without first clicking the Screen panel, except
  // while the user is typing into a real UI field (isEditableTarget) or
  // holding a shortcut modifier. See docs/user/REFERENCE.md for why only
  // visible ASCII + Latin-1 accented characters are recognized.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (isEditableTarget(e.target)) return;
      const code = charCodeForKey(e.key);
      if (code === undefined) return;
      memoryRef.current?.pushKey(code);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Toolbar actions, grouped the same way in both the icon-only toolbar and
  // its text-label dropdown, so the two never drift apart.
  const toolbarGroups = [
    [
      {
        key: 'open',
        icon: <FolderOpenIcon />,
        label: t('file.open'),
        onClick: () => (inTauri ? openFileTauri() : fileInputRef.current?.click()),
        disabled: isRunning,
      },
      { key: 'save', icon: <SaveIcon />, label: t('file.save'), onClick: saveFile, disabled: !canSaveDirect || isRunning },
      { key: 'saveAs', icon: <SaveAsIcon />, label: t('file.saveAs'), onClick: saveFileAs, disabled: isRunning },
    ],
    [
      { key: 'undo', icon: <UndoIcon />, label: t('history.undo'), onClick: doUndo, disabled: !canUndo },
      { key: 'redo', icon: <RedoIcon />, label: t('history.redo'), onClick: doRedo, disabled: !canRedo },
    ],
    [
      {
        key: 'search',
        icon: <SearchIcon />,
        label: t('search.open'),
        onClick: () => editorRef.current?.openSearch(),
        disabled: false,
      },
    ],
    [
      {
        key: 'bookmarkToggle',
        icon: <BookmarkIcon />,
        label: t('bookmark.toggleCurrent'),
        onClick: () => editorRef.current?.toggleBookmarkAtCaret(),
        disabled: false,
      },
      {
        key: 'bookmarkPrev',
        icon: <ChevronLeftIcon />,
        label: t('bookmark.prev'),
        onClick: () => editorRef.current?.jumpBookmark(-1),
        disabled: bookmarks.size === 0,
      },
      {
        key: 'bookmarkNext',
        icon: <ChevronRightIcon />,
        label: t('bookmark.next'),
        onClick: () => editorRef.current?.jumpBookmark(1),
        disabled: bookmarks.size === 0,
      },
    ],
  ];

  return (
    <div className="app">
      <div className="container">
        <div className="panel editor-panel">
          <h2>{t('panel.editor')}</h2>
          <div className="toolbar">
            <div className="toolbar-menu" ref={menuRef}>
              <button
                className="toolbar-button toolbar-button-icon"
                onClick={() => setMenuOpen((open) => !open)}
                title={t('toolbar.menu')}
                aria-label={t('toolbar.menu')}
                aria-expanded={menuOpen}
              >
                <MenuIcon />
              </button>
              {menuOpen && (
                <div className="toolbar-menu-dropdown">
                  {toolbarGroups.map((group, gi) => (
                    <div className="toolbar-menu-group" key={gi}>
                      {group.map((item) => (
                        <button
                          key={item.key}
                          className="toolbar-menu-item"
                          disabled={item.disabled}
                          onClick={() => {
                            item.onClick();
                            setMenuOpen(false);
                          }}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="toolbar-divider" />
            <select
              className="example-select"
              value=""
              disabled={isRunning}
              onChange={(e) => {
                if (e.target.value) loadExample(e.target.value);
              }}
            >
              <option value="">{t('examples.load')}</option>
              {examplesFor(locale).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".asm,.s,.txt,text/plain"
              hidden
              disabled={isRunning}
              onChange={(e) => {
                openFileBrowser(e.target.files?.[0]);
                e.target.value = ''; // allow re-opening the same file
              }}
            />
            {toolbarGroups.map((group, gi) => (
              <Fragment key={gi}>
                <div className="toolbar-divider" />
                <div className="toolbar-group">
                  {group.map((item) => (
                    <button
                      key={item.key}
                      className="toolbar-button toolbar-button-icon"
                      onClick={item.onClick}
                      disabled={item.disabled}
                      title={item.label}
                      aria-label={item.label}
                    >
                      {item.icon}
                    </button>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
          <Editor
            ref={editorRef}
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
