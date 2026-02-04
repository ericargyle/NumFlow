export type Op = '+' | '-'

export type Cell =
  | { kind: 'digit'; value: number; given?: boolean }
  | { kind: 'op'; value: Op; given?: boolean }
  | { kind: 'empty' }

export type Puzzle = {
  title: string
  level: number // 1..100 (MVP v3)
  target: number
  // 3 rows x 4 cols
  grid: Cell[][]
  // allowed digits per row (for trays)
  rowDigits: number[][]
}

export type Level = {
  puzzle: Puzzle
  solution: Cell[][] // full filled grid (digits+ops), used for hint reveals
}

export const ROW_DIGITS: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
]

// Fixed MVP operator positions (consistent with earlier versions)
// Row 1: col 2 (index 1) given '+'
// Row 2: col 3 (index 2) slot (+/-)
// Row 3: col 2 (index 1) slot (+/-)
export const OP_POS = { row1: 1, row2: 2, row3: 1 } as const

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((r) => r.map((c) => ({ ...c } as Cell)))
}

export function gridIsComplete(grid: Cell[][]): boolean {
  for (const row of grid) for (const cell of row) if (cell.kind === 'empty') return false
  return true
}

export function evalLeftToRight(tokens: Array<number | Op>): number {
  if (tokens.length === 0) throw new Error('empty expression')
  let acc = tokens[0]
  if (typeof acc !== 'number') throw new Error('expression must start with number')
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const n = tokens[i + 1]
    if ((op !== '+' && op !== '-') || typeof n !== 'number') throw new Error('bad token stream')
    acc = op === '+' ? acc + n : acc - n
  }
  return acc
}

export function buildTokensFromGrid(grid: Cell[][]): Array<number | Op> {
  // Read strictly left-to-right, top-to-bottom.
  // Digits concatenate (including across row boundaries) until an operator appears.
  const flat: Cell[] = []
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) flat.push(grid[r][c])

  const tokens: Array<number | Op> = []
  let currentDigits: number[] = []

  const flushNumber = () => {
    if (currentDigits.length === 0) return
    tokens.push(Number(currentDigits.join('')))
    currentDigits = []
  }

  for (const cell of flat) {
    if (cell.kind === 'digit') {
      currentDigits.push(cell.value)
      continue
    }
    if (cell.kind === 'op') {
      flushNumber()
      tokens.push(cell.value)
      continue
    }
    throw new Error('Grid contains empty cells')
  }
  flushNumber()
  return tokens
}

export function validatePuzzleRules(puzzle: Puzzle, grid: Cell[][]): { ok: boolean; error?: string } {
  const seen = new Set<number>()
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = grid[r][c]
      if (cell.kind === 'digit') {
        if (seen.has(cell.value)) return { ok: false, error: `Digit ${cell.value} reused.` }
        seen.add(cell.value)
      }
    }
  }
  if (seen.size !== 9) return { ok: false, error: 'All 9 digits must be placed.' }

  for (let r = 0; r < 3; r++) {
    const allowed = new Set(puzzle.rowDigits[r])
    for (let c = 0; c < 4; c++) {
      const cell = grid[r][c]
      if (cell.kind === 'digit' && !allowed.has(cell.value)) {
        return { ok: false, error: `Row ${r + 1} can only use digits {${puzzle.rowDigits[r].join(', ')}}.` }
      }
    }
  }

  for (let r = 0; r < 3; r++) {
    const ops = grid[r].filter((c) => c.kind === 'op')
    if (ops.length !== 1) return { ok: false, error: `Row ${r + 1} must have exactly one operator.` }
  }

  return { ok: true }
}

export function evaluateGrid(grid: Cell[][]): { value: number; expr: string; tokens: Array<number | Op> } {
  if (!gridIsComplete(grid)) throw new Error('Grid is not complete')
  const tokens = buildTokensFromGrid(grid)

  if (tokens.length < 3) throw new Error('Expression too short')
  if (typeof tokens[0] !== 'number') throw new Error('Expression must start with a number')
  if (typeof tokens[tokens.length - 1] !== 'number') throw new Error('Expression must end with a number')
  for (let i = 1; i < tokens.length; i++) {
    if (i % 2 === 1 && (tokens[i] !== '+' && tokens[i] !== '-')) throw new Error('Expected operator')
    if (i % 2 === 0 && typeof tokens[i] !== 'number') throw new Error('Expected number')
  }

  const value = evalLeftToRight(tokens)
  const expr = tokens.join(' ')
  return { value, expr, tokens }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeEmptyGrid(): Cell[][] {
  return [
    [{ kind: 'empty' }, { kind: 'op', value: '+', given: true }, { kind: 'empty' }, { kind: 'empty' }],
    [{ kind: 'empty' }, { kind: 'empty' }, { kind: 'op', value: '+', given: false }, { kind: 'empty' }],
    [{ kind: 'empty' }, { kind: 'op', value: '+', given: false }, { kind: 'empty' }, { kind: 'empty' }],
  ]
}

function applyHints(base: Cell[][], solution: Cell[][], hintCount: number): Cell[][] {
  const grid = cloneGrid(base)

  // Candidate digit positions (exclude operator cells)
  const candidates: Array<{ r: number; c: number }> = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c].kind === 'empty') candidates.push({ r, c })
    }
  }

  const picks = shuffle(candidates).slice(0, hintCount)
  for (const { r, c } of picks) {
    const sol = solution[r][c]
    if (sol.kind === 'digit') grid[r][c] = { ...sol, given: true }
  }
  return grid
}

export function generateLevels(count = 100): Level[] {
  const levels: Level[] = []
  for (let i = 1; i <= count; i++) {
    // Make a random full solution respecting row digit pools.
    const r1 = shuffle(ROW_DIGITS[0])
    const r2 = shuffle(ROW_DIGITS[1])
    const r3 = shuffle(ROW_DIGITS[2])

    // operators
    const op1: Op = '+'
    const op2: Op = Math.random() < 0.5 ? '+' : '-'
    const op3: Op = Math.random() < 0.5 ? '+' : '-'

    // Construct solution grid (3x4)
    const sol: Cell[][] = [
      [
        { kind: 'digit', value: r1[0] },
        { kind: 'op', value: op1, given: true },
        { kind: 'digit', value: r1[1] },
        { kind: 'digit', value: r1[2] },
      ],
      [
        { kind: 'digit', value: r2[0] },
        { kind: 'digit', value: r2[1] },
        { kind: 'op', value: op2 },
        { kind: 'digit', value: r2[2] },
      ],
      [
        { kind: 'digit', value: r3[0] },
        { kind: 'op', value: op3 },
        { kind: 'digit', value: r3[1] },
        { kind: 'digit', value: r3[2] },
      ],
    ]

    const target = evaluateGrid(sol).value

    // Hints per difficulty bands
    let hintCount = 2
    if (i >= 40 && i <= 79) hintCount = 1
    if (i >= 80) hintCount = 0

    const base = makeEmptyGrid()
    // Set operator slot defaults to the solution (still toggleable)
    ;(base[1][2] as Extract<Cell, { kind: 'op' }>).value = op2
    ;(base[2][1] as Extract<Cell, { kind: 'op' }>).value = op3

    const hinted = applyHints(base, sol, hintCount)

    levels.push({
      puzzle: {
        title: 'Numberflow',
        level: i,
        target,
        rowDigits: ROW_DIGITS,
        grid: hinted,
      },
      solution: sol,
    })
  }

  return levels
}
