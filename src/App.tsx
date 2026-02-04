import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { SAMPLE_PUZZLES, type Cell, cloneGrid, evaluateGrid, validatePuzzleRules } from './numflow'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'

type Selected = { row: number; digit: number } | null

type DragData = { kind: 'digit'; row: number; digit: number }

type CellId = `cell:${number}:${number}`
function cellId(r: number, c: number): CellId {
  return `cell:${r}:${c}`
}

function cellLabel(cell: Cell): string {
  if (cell.kind === 'empty') return ''
  if (cell.kind === 'digit') return String(cell.value)
  return cell.value
}

function DraggableDigit({ row, digit, disabled, active, onPick }: { row: number; digit: number; disabled: boolean; active: boolean; onPick: () => void }) {
  const id = `digit:${row}:${digit}`
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { kind: 'digit', row, digit } satisfies DragData,
    disabled,
  })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : undefined,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      className={['digitBtn', disabled ? 'disabled' : '', active ? 'active' : '', isDragging ? 'dragging' : ''].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onPick}
      {...listeners}
      {...attributes}
    >
      {digit}
    </button>
  )
}

function DroppableCell({
  r,
  c,
  canDrop,
  children,
  className,
  onClick,
}: {
  r: number
  c: number
  canDrop: boolean
  children: React.ReactNode
  className: string
  onClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(r, c),
    data: { r, c },
    disabled: !canDrop,
  })

  return (
    <button
      ref={setNodeRef}
      className={[className, isOver ? 'over' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function App() {
  const puzzle = SAMPLE_PUZZLES[0]

  const [grid, setGrid] = useState<Cell[][]>(() => cloneGrid(puzzle.grid))
  const [selected, setSelected] = useState<Selected>(null)
  const [myScore, setMyScore] = useState<number>(() => {
    const v = localStorage.getItem('numflow:score')
    const n = v ? Number(v) : 0
    return Number.isFinite(n) ? n : 0
  })
  const wasCorrectRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  const usedDigits = useMemo(() => {
    const used = new Set<number>()
    for (const row of grid) for (const cell of row) if (cell.kind === 'digit') used.add(cell.value)
    return used
  }, [grid])

  const status = useMemo(() => {
    try {
      const rules = validatePuzzleRules(puzzle, grid)
      if (!rules.ok) return { state: 'invalid' as const, message: rules.error ?? 'Invalid.' }

      const { value, expr } = evaluateGrid(grid)
      if (value === puzzle.target) return { state: 'correct' as const, message: `Correct!  ${expr} = ${value}` }
      return { state: 'wrong' as const, message: `Not quite.  ${expr} = ${value}` }
    } catch {
      return { state: 'incomplete' as const, message: 'Place all digits and choose operators.' }
    }
  }, [grid, puzzle])

  // When the puzzle becomes correct (edge), increment score + persist.
  useEffect(() => {
    const isCorrect = status.state === 'correct'
    if (isCorrect && !wasCorrectRef.current) {
      setMyScore((prev) => {
        const next = prev + 1
        localStorage.setItem('numflow:score', String(next))
        return next
      })
    }
    wasCorrectRef.current = isCorrect
  }, [status.state])

  const reset = () => {
    setGrid(cloneGrid(puzzle.grid))
    setSelected(null)
  }

  const toggleOp = (r: number, c: number) => {
    setGrid((prev) => {
      const next = cloneGrid(prev)
      const cell = next[r][c]
      if (cell.kind !== 'op') return prev
      if (cell.given) return prev
      cell.value = cell.value === '+' ? '-' : '+'
      return next
    })
  }

  const clearDigit = (r: number, c: number) => {
    setGrid((prev) => {
      const next = cloneGrid(prev)
      const cell = next[r][c]
      if (cell.kind !== 'digit') return prev
      if (cell.given) return prev
      next[r][c] = { kind: 'empty' }
      return next
    })
  }

  const placeDigit = (r: number, c: number, fromRow: number, digit: number) => {
    // Must place into same row tray
    if (fromRow !== r) return
    if (usedDigits.has(digit)) return

    setGrid((prev) => {
      const next = cloneGrid(prev)
      const cell = next[r][c]
      if (cell.kind !== 'empty') return prev
      next[r][c] = { kind: 'digit', value: digit }
      return next
    })
  }

  const onCellClick = (r: number, c: number) => {
    const cell = grid[r][c]
    if (cell.kind === 'op') return toggleOp(r, c)
    if (cell.kind === 'digit') return clearDigit(r, c)

    // fallback: click-to-place
    if (!selected) return
    placeDigit(r, c, selected.row, selected.digit)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id
    const activeData = event.active.data.current as DragData | undefined
    if (!overId || !activeData || activeData.kind !== 'digit') return

    // overId like cell:r:c
    if (typeof overId !== 'string' || !overId.startsWith('cell:')) return
    const [, rs, cs] = overId.split(':')
    const r = Number(rs)
    const c = Number(cs)
    if (!Number.isFinite(r) || !Number.isFinite(c)) return

    placeDigit(r, c, activeData.row, activeData.digit)
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">NumFlow</div>
          <div className="subtitle">{puzzle.title} • Level {puzzle.level}</div>
        </div>

        <div className="target" aria-label="Score and target">
          <div className="targetTop">
            <div className="score">
              <div className="scoreLabel">My Score</div>
              <div className="scoreValue">{myScore}</div>
            </div>

            <div className="targetRight">
              <div className="targetLabel">Target</div>
              <div className="targetValue">{puzzle.target}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragEnd={onDragEnd}>
          <section className="grid" aria-label="Puzzle grid">
            {grid.map((row, r) => (
              <div className="gridRow" key={r}>
                {row.map((cell, c) => {
                  const isGiven = cell.kind !== 'empty' && !!cell.given
                  const kind = cell.kind

                  const canDrop = cell.kind === 'empty'

                  const classes = ['cell', kind, isGiven ? 'given' : '', selected && cell.kind === 'empty' ? 'placeable' : '']
                    .filter(Boolean)
                    .join(' ')

                  const ariaLabel =
                    cell.kind === 'op'
                      ? `Operator ${cell.value}${cell.given ? ', given' : ', tap to toggle'}`
                      : cell.kind === 'digit'
                        ? `Digit ${cell.value}${cell.given ? ', given' : ', tap to remove'}`
                        : 'Empty cell'

                  if (cell.kind === 'empty') {
                    return (
                      <DroppableCell
                        key={c}
                        r={r}
                        c={c}
                        canDrop={canDrop}
                        className={classes}
                        onClick={() => onCellClick(r, c)}
                      >
                        <span aria-label={ariaLabel}>{cellLabel(cell)}</span>
                      </DroppableCell>
                    )
                  }

                  return (
                    <button key={c} className={classes} onClick={() => onCellClick(r, c)} aria-label={ariaLabel}>
                      <span>{cellLabel(cell)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </section>

          <section className="trays" aria-label="Available digits">
            <div className="trayTitle">Digits</div>

            {puzzle.rowDigits.map((digits, r) => (
              <div className="trayRow" key={r}>
                <div className="trayRowLabel">Row {r + 1}</div>
                <div className="trayDigits">
                  {digits.map((d) => {
                    const disabled = usedDigits.has(d)
                    const active = selected?.row === r && selected.digit === d
                    return (
                      <DraggableDigit key={d} row={r} digit={d} disabled={disabled} active={active} onPick={() => setSelected({ row: r, digit: d })} />
                    )
                  })}
                </div>
              </div>
            ))}

            <div className={['status', status.state].join(' ')}>{status.message}</div>
            <div className="actions">
              <button className="btn" onClick={reset}>
                Reset
              </button>
            </div>
          </section>
        </DndContext>
      </main>

      <footer className="footer">MVP • left-to-right evaluation (no precedence) • digits concatenate until an operator</footer>
    </div>
  )
}

export default App
