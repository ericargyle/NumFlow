export type Op = '+' | '-'

export type Cell =
  | { kind: 'digit'; value: number; given?: boolean }
  | { kind: 'op'; value: Op; given?: boolean }
  | { kind: 'empty' }

export type Puzzle = {
  title: string
  level: 1 | 2 | 3 | 4 | 5
  target: number
  // 3 rows x 4 cols
  grid: Cell[][]
  // allowed digits per row (for trays)
  rowDigits: number[][]
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((r) => r.map((c) => ({ ...c } as Cell)))
}

export function gridIsComplete(grid: Cell[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.kind === 'empty') return false
    }
  }
  return true
}

export function evalLeftToRight(tokens: Array<number | Op>): number {
  // tokens like [123, '+', 45, '-', 6]
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
  // Concatenate digits until an operator appears, which finalizes the current number.
  const flat: Cell[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) flat.push(grid[r][c])
  }

  const tokens: Array<number | Op> = []
  let currentDigits: number[] = []

  const flushNumber = () => {
    if (currentDigits.length === 0) return
    const num = Number(currentDigits.join(''))
    tokens.push(num)
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
    // empty -> expression incomplete
    throw new Error('Grid contains empty cells')
  }
  flushNumber()
  return tokens
}

export function validatePuzzleRules(puzzle: Puzzle, grid: Cell[][]): { ok: boolean; error?: string } {
  // 1) Each digit used exactly once (and all 9 digits placed)
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

  // 2) Row digit constraints
  for (let r = 0; r < 3; r++) {
    const allowed = new Set(puzzle.rowDigits[r])
    for (let c = 0; c < 4; c++) {
      const cell = grid[r][c]
      if (cell.kind === 'digit' && !allowed.has(cell.value)) {
        return { ok: false, error: `Row ${r + 1} can only use digits {${puzzle.rowDigits[r].join(', ')}}.` }
      }
    }
  }

  // 3) Exactly one operator per row
  for (let r = 0; r < 3; r++) {
    const ops = grid[r].filter((c) => c.kind === 'op')
    if (ops.length !== 1) return { ok: false, error: `Row ${r + 1} must have exactly one operator.` }
  }

  return { ok: true }
}

export function evaluateGrid(grid: Cell[][]): { value: number; expr: string; tokens: Array<number | Op> } {
  if (!gridIsComplete(grid)) throw new Error('Grid is not complete')

  const tokens = buildTokensFromGrid(grid)

  // Must alternate number/op/number/op/...
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

// MVP: a single Level 1 puzzle with a unique solution.
// Operator positions:
// - Row 1: col 2 (given '+')
// - Row 2: col 3 (player chooses +/-)
// - Row 3: col 2 (player chooses +/-)
// Reading order cell stream:
//   a  op1  b c d e  op2  f g  op3  h i
// Numbers are concatenated until an operator appears.
export const SAMPLE_PUZZLES: Puzzle[] = [
  {
    title: 'Numberflow',
    level: 1,
    target: 2379,
    rowDigits: [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
    grid: [
      // Row 1: [digit, op(given), digit, digit]
      [{ kind: 'empty' }, { kind: 'op', value: '+', given: true }, { kind: 'empty' }, { kind: 'empty' }],

      // Row 2: [digit, digit(given hint), op(slot), digit]
      [{ kind: 'empty' }, { kind: 'digit', value: 6, given: true }, { kind: 'op', value: '+', given: false }, { kind: 'empty' }],

      // Row 3: [digit, op(slot), digit, digit(given hint)]
      [{ kind: 'empty' }, { kind: 'op', value: '+', given: false }, { kind: 'empty' }, { kind: 'digit', value: 9, given: true }],
    ],
  },
]
