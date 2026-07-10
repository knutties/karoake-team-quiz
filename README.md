# 🎤 Karaoke Team Quiz

A zero-backend web app for running a karaoke-style team quiz. Everything runs
in the browser and all data is stored in the browser's `localStorage` — nothing
is ever sent to a server.

## What it does

1. **Configure** the quiz on the Setup screen:
   - a list of **types of people** (e.g. Soprano, Alto, Tenor, Bass),
   - a list of **families** (e.g. Smith, Jones),
   - a list of **people**, each belonging to a type and a family,
   - a list of **song categories**,
   - the **number of teams**, and
   - the **number of rounds**.
2. **Creates the teams** and allocates people across them so that each **type**
   is spread as evenly as possible, while also keeping members of the same
   **family** on different teams as much as possible. (Type balance is the hard
   goal; family separation is a best-effort tie-breaker on top of it.)
3. Shows the **quiz grid** — one column per team, one row per round.
   - On a team's turn, a **🎲 Pick category** button appears in that cell. It
     randomly selects a category, preferring ones the team hasn't used yet.
   - After the person has sung, a **rating popup** of emojis appears. Choosing
     one records the score and passes the turn to the next team/round.
4. The quiz can be **ended at any time**, and the completed grid stays visible.

Progress is saved automatically, so you can refresh or close the tab and pick up
where you left off.

## Running locally

It's pure HTML/CSS/JS — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Hosting on GitHub Pages

Two options:

- **From a branch (simplest):** in the repository's **Settings → Pages**, set
  the source to *Deploy from a branch* and pick the branch and `/ (root)`
  folder. The `.nojekyll` file ensures the static files are served as-is.
- **From Actions:** the workflow in `.github/workflows/deploy-pages.yml` deploys
  the site automatically on every push to `main`. In **Settings → Pages**, set
  the source to *GitHub Actions*.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and view structure |
| `styles.css` | Styling |
| `app.js` | All quiz logic and `localStorage` persistence |
