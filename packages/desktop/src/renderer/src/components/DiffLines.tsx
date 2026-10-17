import { lineClass } from '../unified-diff'

// A unified diff, one line per row, coloured by what each line does.
export function DiffLines({ patch }: { patch: string }) {
  return (
    <pre className="diff-view">
      {patch.split('\n').map((line, index) => (
        <div key={index} className={lineClass(line)}>{line || ' '}</div>
      ))}
    </pre>
  )
}
