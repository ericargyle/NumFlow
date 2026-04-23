import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { type Cell, cloneGrid, evaluateGrid, generateLevels, validatePuzzleRules } from './numflow'
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

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}


const VERSION = 'v2'
const SCORE_STORAGE_KEY = 'numflow:v04.20.2020:score'
const LEGACY_SCORE_KEY = 'numflow:v3:score'

function shuffleArray<T>(items: T[]): T[] {
  const cloned = [...items]
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cloned[i], cloned[j]] = [cloned[j], cloned[i]]
  }
  return cloned
}

function ShuffleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M16 4h4v4m0-4-5 5m0 0-3.5-3.5M4 15h4v4m0-4-5 5m0-5 3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DraggableDigit({
  row,
  digit,
  disabled,
  active,
  shimmer,
  onPick,
}: {
  row: number
  digit: number
  disabled: boolean
  active: boolean
  shimmer?: boolean
  onPick: () => void
}) {
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
      className={['digitBtn', disabled ? 'disabled' : '', active ? 'active' : '', shimmer ? 'shimmer' : '', isDragging ? 'dragging' : '']
        .filter(Boolean)
        .join(' ')}
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
    <button ref={setNodeRef} className={[className, isOver ? 'over' : ''].filter(Boolean).join(' ')} onClick={onClick}>
      {children}
    </button>
  )
}

function LightbulbIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M9 21h6m-5-3h4m-1.3-2.3c.7-.8 1.3-1.6 1.3-3.2 0-1.1.6-2 1.5-3A6.5 6.5 0 1 0 6.6 9.5c.9 1 1.4 1.9 1.4 3 0 1.7.6 2.5 1.3 3.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M10 7a2 2 0 0 1 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function App() {
  const levels = useMemo(() => generateLevels(100), [])

  const [levelIndex, setLevelIndex] = useState(0)
  const level = levels[levelIndex]
  const puzzle = level.puzzle

  const [grid, setGrid] = useState<Cell[][]>(() => cloneGrid(puzzle.grid))
  const [selected, setSelected] = useState<Selected>(null)

  const [, setScore] = useState<number>(() => {
    const stored = localStorage.getItem(SCORE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SCORE_KEY)
    const n = stored ? Number(stored) : 0
    return Number.isFinite(n) ? n : 0
  })

  const [secondsLeft, setSecondsLeft] = useState(300)
  const timerRef = useRef<number | null>(null)

  const [hintMsg, setHintMsg] = useState<string>('')
  const [digitLayout, setDigitLayout] = useState<number[][]>(() => puzzle.rowDigits.map((digits) => [...digits]))
  const [hintUsed, setHintUsed] = useState(false)
  const [shimmerTarget, setShimmerTarget] = useState<{ row: number; digit: number } | null>(null)
  const celebrationPlayedRef = useRef(false)
  const [failure, setFailure] = useState(false)
  const failureSoundRef = useRef(false)

  // Reset state on level change
  useEffect(() => {
    setGrid(cloneGrid(puzzle.grid))
    setSelected(null)
    setSecondsLeft(300)
    setHintMsg('')
    setDigitLayout(puzzle.rowDigits.map((digits) => [...digits]))
    setHintUsed(false)
    setShimmerTarget(null)
    celebrationPlayedRef.current = false
    setFailure(false)
    failureSoundRef.current = false
  }, [levelIndex])

  // Timer tick
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [levelIndex])

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

  useEffect(() => {
    for (let r = 0; r < digitLayout.length; r += 1) {
      for (const digit of digitLayout[r]) {
        if (!usedDigits.has(digit)) {
          setShimmerTarget({ row: r, digit })
          return
        }
      }
    }
    setShimmerTarget(null)
  }, [digitLayout, usedDigits])

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

  const staticCells = useMemo(() => {
    const set = new Set<CellId>()
    for (let r = 0; r < puzzle.grid.length; r += 1) {
      for (let c = 0; c < puzzle.grid[r].length; c += 1) {
        if (puzzle.grid[r][c].kind !== 'empty') {
          set.add(cellId(r, c))
        }
      }
    }
    return set
  }, [puzzle.grid])

  useEffect(() => {
    if (secondsLeft === 0 && status.state !== 'correct') {
      setFailure(true)
    }
  }, [secondsLeft, status.state])

  useEffect(() => {
    if (failure && timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [failure])

  useEffect(() => {
    if (!failure || failureSoundRef.current) return
    failureSoundRef.current = true
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(120, ctx.currentTime)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.35)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 1.2)
    const closeTimer = window.setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1500)
    return () => {
      window.clearTimeout(closeTimer)
      oscillator.stop()
      ctx.close().catch(() => {})
    }
  }, [failure])

  // Increment score once per level when solved
  const solvedRef = useRef(false)
  useEffect(() => {
    const isSolved = status.state === 'correct'
    if (isSolved && !solvedRef.current) {
      solvedRef.current = true
      setScore((prev) => {
        const next = prev + 1
        localStorage.setItem(SCORE_STORAGE_KEY, String(next))
        return next
      })
    }
    if (!isSolved) solvedRef.current = false
  }, [status.state])

  useEffect(() => {
    if (status.state === 'correct') {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (!celebrationPlayedRef.current) {
        celebrationPlayedRef.current = true
        if (typeof window !== 'undefined') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
          if (AudioCtx) {
            const ctx = new AudioCtx()
            const oscillator = ctx.createOscillator()
            oscillator.type = 'triangle'
            oscillator.frequency.setValueAtTime(520, ctx.currentTime)
            const gain = ctx.createGain()
            gain.gain.setValueAtTime(0.001, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.06)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
            oscillator.connect(gain).connect(ctx.destination)
            oscillator.start()
            oscillator.stop(ctx.currentTime + 0.4)
            setTimeout(() => {
              ctx.close().catch(() => {})
            }, 600)
          }
        }
      }
    } else {
      celebrationPlayedRef.current = false
    }
  }, [status.state])

  const reset = () => {
    setGrid(cloneGrid(puzzle.grid))
    setSelected(null)
    setHintMsg('')
    setFailure(false)
    failureSoundRef.current = false
  }

  const nextLevel = () => {
    setLevelIndex((i) => (i < levels.length - 1 ? i + 1 : i))
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

    if (!selected) return
    placeDigit(r, c, selected.row, selected.digit)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id
    const activeData = event.active.data.current as DragData | undefined
    if (!overId || !activeData || activeData.kind !== 'digit') return

    if (typeof overId !== 'string' || !overId.startsWith('cell:')) return
    const [, rs, cs] = overId.split(':')
    const r = Number(rs)
    const c = Number(cs)
    if (!Number.isFinite(r) || !Number.isFinite(c)) return

    placeDigit(r, c, activeData.row, activeData.digit)
  }

  const canUseHint = secondsLeft > 60 && !hintUsed

  const useHint = () => {
    if (!canUseHint) return

    // Find an empty digit cell and fill it with the correct digit from the solution.
    const empties: Array<{ r: number; c: number }> = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c].kind === 'empty') empties.push({ r, c })
      }
    }

    if (empties.length === 0) return
    const pick = empties[Math.floor(Math.random() * empties.length)]
    const sol = level.solution[pick.r][pick.c]
    if (sol.kind !== 'digit') return

    setGrid((prev) => {
      const next = cloneGrid(prev)
      if (next[pick.r][pick.c].kind !== 'empty') return prev
      next[pick.r][pick.c] = { kind: 'digit', value: sol.value, given: true }
      return next
    })
    setHintUsed(true)

    setSecondsLeft((s) => Math.max(0, s - 60))
    setHintMsg('Hint used • 1 minute penalty')
  }

  const shuffleTray = () => {
    setDigitLayout((prev) =>
      prev.map((digits) => {
        const available = digits.filter((d) => !usedDigits.has(d))
        const locked = digits.filter((d) => usedDigits.has(d))
        return [...shuffleArray(available), ...locked]
      }),
    )
  }

  const clockTone = secondsLeft <= 60 ? 'red' : secondsLeft <= 120 ? 'yellow' : 'normal'

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">
            NumFlow <span className="version">{VERSION}</span>
          </div>
          <div className="subtitle">
            {puzzle.title} • Level {puzzle.level}/100
          </div>
        </div>

        <div className="topRight">
          <div className={["infoBox", "clock", clockTone].join(' ')} aria-label="Countdown clock">
            <div className="infoLabel">Time</div>
            <div className="infoValue">{formatMMSS(secondsLeft)}</div>
          </div>

          {/* score box removed */}
          <div className="infoBox" aria-label="Target">
            <div className="infoLabel">Target</div>
            <div className="infoValue">{puzzle.target}</div>
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

                  const classes = ['cell', kind, isGiven ? 'given' : '', staticCells.has(cellId(r, c)) ? 'static' : '', selected && cell.kind === 'empty' ? 'placeable' : '']
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
                      <DroppableCell key={c} r={r} c={c} canDrop={canDrop} className={classes} onClick={() => onCellClick(r, c)}>
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

          <section className="trays" aria-label="Digits and hint">
            <div className="trayTop">
              <div className="trayTitle">Digits</div>
            </div>

            <div className="trayLayout">
              <div className="digitsBox" aria-label="Digits trays">
                {digitLayout.map((digits, r) => (
                  <div className="trayRow" key={r}>
                    <div className="trayRowLabel">Row {r + 1}</div>
                    <div className="trayDigits">
                      {digits.map((d) => {
                        const disabled = usedDigits.has(d)
                        const active = selected?.row === r && selected.digit === d
                        const highlight = shimmerTarget?.row === r && shimmerTarget?.digit === d
                        return (
                          <DraggableDigit
                            key={d}
                            row={r}
                            digit={d}
                            disabled={disabled}
                            active={active}
                            shimmer={highlight}
                            onPick={() => setSelected({ row: r, digit: d })}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hintBox" aria-label="Hint and shuffle controls">
                <div className="controlStack">
                  <button
                    className={['controlBtnLarge', !canUseHint ? 'disabled' : ''].join(' ')}
                    onClick={useHint}
                    disabled={!canUseHint}
                    aria-label="Use a hint (1 minute penalty)"
                  >
                    <div className="controlBtnInner">
                      <div className="controlIconWrap">
                        <LightbulbIcon size={44} />
                      </div>
                      <div className="controlBtnLabel">Hint</div>
                      <div className="hintPenalty">1 minute penalty</div>
                    </div>
                  </button>
                  <button
                    className="controlBtnLarge shuffle"
                    onClick={shuffleTray}
                    type="button"
                    aria-label="Shuffle playable numbers"
                  >
                    <div className="controlBtnInner">
                      <div className="controlIconWrap">
                        <ShuffleIcon size={34} />
                      </div>
                      <div className="controlBtnLabel">Shuffle</div>
                    </div>
                  </button>
                </div>
                {hintMsg ? <div className="hintMsg">{hintMsg}</div> : null}
              </div>
            </div>

            <div className={['status', status.state].join(' ')}>{status.message}</div>
            <div className="actions">
              <button className="btn" onClick={reset}>
                Reset
              </button>
              <button className="btn" onClick={nextLevel} disabled={levelIndex >= levels.length - 1}>
                Next
              </button>
            </div>
          </section>
        </DndContext>
      </main>

      <footer className="footer">{VERSION} • timer + hints • digits concatenate across all 12 cells</footer>
      {status.state === 'correct' && (
        <div className="victoryOverlay" role="alertdialog" aria-live="assertive">
          <div className="victoryDialog">
            <p>Good job!</p>
            <div className="victoryActions">
              <button className="btn primary" onClick={nextLevel} disabled={levelIndex >= levels.length - 1}>
                Next level
              </button>
            </div>
          </div>
        </div>
      )}
      {failure && (
        <div className="failureOverlay" role="alert" aria-live="assertive">
          <div className="failureDialog">
            <p>YOU FAILED!</p>
            <div className="failureActions">
              <button className="btn" onClick={reset}>
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
