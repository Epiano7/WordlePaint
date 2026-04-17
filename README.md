# WordlePaint

WordlePaint is a static browser app for painting a six-row Wordle board and solving it against a known answer word.

## Run locally

Open `index.html` with a simple local web server so the browser can fetch `words.txt`.

Python example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Push these files to a GitHub repository and enable GitHub Pages for the branch:

- `index.html`
- `styles.css`
- `app.js`
- `words.txt`

The site is fully static and runs client-side.
