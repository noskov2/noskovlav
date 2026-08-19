Doggo Catch – Endless Runner (Web, mobile-friendly)

How to play:
- Tap (or click) to jump.
- Catch RED BALLS to gain points.
- Avoid CRATES (obstacles). Hitting one ends the run.

How to run on iPhone:
1) Unzip the folder.
2) Host the folder as a static website (anywhere: Netlify, Vercel, GitHub Pages, or even your router/NAS).
   - The game uses a CDN for Three.js, so you need an internet connection.
3) Visit the hosted URL in Safari on your iPhone.
4) (Optional) Add to Home Screen from Safari's Share menu for full-screen play.

Local testing on a computer:
- Double-click index.html to open in a browser.
- If your browser blocks local module/CDN, run a small local server, e.g.:
  - Python: `python3 -m http.server` (then open http://localhost:8000)

Notes:
- The dog and objects are simple shapes to keep performance smooth on phones.
- This is an endless runner with difficulty that increases over time.
- If you want lane switching or swipes, it can be added easily.
