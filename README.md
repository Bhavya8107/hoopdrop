# HoopDrop 🏀 — File Drop in Basketball Hoop

An authentic, physics-driven drag-and-drop & slingshot file uploader web application with realistic basketball acoustics.

## 🚀 Features
- **Interactive File Uploader**:
  - Slingshot pull-down aiming with real-time dotted parabolic trajectory arc.
  - Authentic 1:1 pointer drag and drop mechanics.
  - Realistic upper rim bounce physics (backboard thud and dual rim rattle above the net).
  - Clean net swish animation with particle bursts, smoothly absorbing files directly into the basket.
  - Bottom upload shelf with animated progress bars and completed checkmark badges.
  - Zero external assets: procedural Web Audio API sound synthesizer and SVG-based basketball hoop & net.

## 📂 Project Structure
- `index.html` — Main interactive web application.
- `styles.css` — Modern UI styling, court markings, basketball backboard, rim, and upload shelf.
- `app.js` — Interactive slingshot aiming, physics engine, upper rim bounce, swish animations, and auto-spawning cards.
- `audio.js` — Procedural Web Audio API sound effects (slingshot whoosh, backboard thud, rim tap, net swish, chime).

## 🏃 How to Run
Run any local web server in this directory:
```bash
# Using Python:
python3 -m http.server 5500

# Or using VS Code Live Server:
# Open this folder in VS Code and click "Go Live"
```
Then open `http://127.0.0.1:5500` in your web browser.
