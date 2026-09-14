import './Editor.css'

interface EditorProps {
  code: string
  onChange: (code: string) => void
}

export default function Editor({ code, onChange }: EditorProps) {
  return (
    <div className="editor">
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        spellCheck="false"
        className="editor-textarea"
      />
    </div>
  )
}
