# NumFlow (Numberflow)

A minimalist, web-based logic + math puzzle game.

## MVP Rules (implemented)

- Grid: **4 columns × 3 rows**
- Each row contains **exactly 1 operator** (`+` or `−`)
- Digits are placed into empty cells.
- Digits **concatenate** in reading order **left-to-right, top-to-bottom** until an operator appears.
- The full expression is evaluated **strictly left-to-right** (no operator precedence).
- Each digit is used exactly once.
- Row digit constraints:
  - Row 1: `{1,2,3}`
  - Row 2: `{4,5,6}`
  - Row 3: `{7,8,9}`

## Local development

```bash
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`).

## Deployment (GitHub Pages)

This repo includes a GitHub Actions workflow that builds and deploys to Pages on every push to `main`.

Once Pages is enabled, the app will be at:

- https://ericargyle.github.io/NumFlow/

If Pages isn’t enabled yet, go to:

- GitHub repo → **Settings** → **Pages** → set Source to **GitHub Actions**
