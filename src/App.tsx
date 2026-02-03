import { useMemo, useState } from 'react'
import './App.css'
import { SAMPLE_PUZZLES, type Cell, cloneGrid, evaluateGrid, validatePuzzleRules } from './numflow'

type Selected = { row: number; digit: number } | null

function cellLabel(cell: Cell): string {
  if (cell.kind === 'empty') return ''
  if (cell.kind === 'digit') return String(cell.value)
  return cell.value
}

function App() {
  const puzzle = SAMPLE_PUZZLES[0]

  const [grid, setGrid] = useState<Cell[][]>(() => cloneGrid(puzzle.grid))
  const [selected, setSelected] = useState<Selected>(null)

  const usedDigits = useMemo(() => {
    const used = new Set<number>()
    for (const row of grid) for (const cell of row) if (cell.kind === 'digit') used.add(cell.value)
    return used
  }, [grid])

  const status = useMemo(() => {
    // Only evaluate when complete.
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

  const placeDigit = (r: number, c: number) => {
    if (!selected) return
    const { row: fromRow, digit } = selected

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
    return placeDigit(r, c)
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">NumFlow</div>
          <div className="subtitle">{puzzle.title} • Level {puzzle.level}</div>
        </div>
        <div className="target">
          <div className="targetLabel">Target</div>
          <div className="targetValue">{puzzle.target}</div>
        </div>
      </header>

      <main className="main">
        <section className="grid" aria-label="Puzzle grid">
          {grid.map((row, r) => (
            <div className="gridRow" key={r}>
              {row.map((cell, c) => {
                const isGiven = cell.kind !== 'empty' && !!cell.given
                const kind = cell.kind
                const classes = ['cell', kind, isGiven ? 'given' : '', selected && cell.kind === 'empty' ? 'placeable' : '']
                  .filter(Boolean)
                  .join(' ')

                return (
                  <button
                    key={c}
                    className={classes}
                    onClick={() => onCellClick(r, c)}
                    aria-label={
                      cell.kind === 'op'
                        ? `Operator ${cell.value}${cell.given ? ', given' : ', tap to toggle'}`
                        : cell.kind === 'digit'
                          ? `Digit ${cell.value}${cell.given ? ', given' : ', tap to remove'}`
                          : 'Empty cell'
                    }
                  >
                    <span>{cellLabel(cell)}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </section>

        <section className="trays" aria-label="Available digits">
          <div className="trayTitle">Digits</div>
          <div className="trayHint">Select a digit, then click an empty cell in the same row. Click a placed digit to remove. Tap operator slots to toggle +/−.</div>

          {puzzle.rowDigits.map((digits, r) => (
            <div className="tray" key={r}>
              <div className="trayLabel">Row {r + 1}</div>
              <div className="trayDigits">
                {digits.map((d) => {
                  const disabled = usedDigits.has(d)
                  const active = selected?.row === r && selected.digit === d
                  return (
                    <button
                      key={d}
                      className={['digitBtn', disabled ? 'disabled' : '', active ? 'active' : ''].filter(Boolean).join(' ')}
                      disabled={disabled}
                      onClick={() => setSelected({ row: r, digit: d })}
                    >
                      {d}
                    </button>
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
      </main>

      <footer className="footer">MVP • left-to-right evaluation (no precedence) • digits concatenate until an operator</footer>
    </div>
  )
}

export default App
