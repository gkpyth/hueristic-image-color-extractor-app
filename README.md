# Hueristic

A Flask web app that extracts dominant color palettes from any image using K-means clustering. Upload, drag, or paste an image and get HEX, RGB, HSL, and human-readable color names — plus exports in CSS, JSON, and PNG. Built with Python, Flask, NumPy, and scikit-learn.

## Live Demo
[hueristic.onrender.com](https://hueristic.onrender.com)

*Note: hosted on Render's free tier — first load after idle may take ~30–60 seconds to spin up.*

## Features
- K-means clustering to identify visually distinct dominant colors
- Adjustable palette size (5–20 colors) via live slider
- Three input methods: click to upload, drag & drop, paste from clipboard
- Four curated sample images for one-click demos
- Sticky source image stays in view while scrolling through the palette
- Per-color metadata: HEX, RGB, HSL, human-readable name (~1,500 names via pycolornames), dominance percentage
- Click-to-copy HEX with toast feedback
- Four export formats:
  - Copy all HEX codes to clipboard (comma-separated)
  - PNG palette grid (Pinterest-ratio, branded header, rounded corners)
  - CSS custom properties file (with semantic `--accent` alias)
  - JSON with metadata envelope
- Exports dynamically match the current palette size
- Client-side file size validation (10MB cap) before upload attempt
- Graceful handling of oversized files, unsupported types, and corrupt images
- Info tooltip explaining name approximation vs. exact color values
- Responsive design with mobile breakpoints
- Reduced-motion accessibility support
- Staggered swatch reveal animation
- Gradient "Hue" logo matching the app's hue-focused purpose
- Favicon and Open Graph meta tags for social sharing

## Requirements
- Python 3.12
- Flask
- Pillow
- NumPy
- scikit-learn
- pycolornames
- gunicorn
- python-dotenv

## Installation
```
pip install -r requirements.txt
```

## How to Run
```
python app.py
```
The app runs at `http://localhost:5000`.

To enable debug mode locally, create a `.env` file in the project root:
```
FLASK_DEBUG=1
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main application page |
| `POST` | `/extract` | Extract colors from uploaded image (multipart/form-data) |

The `/extract` endpoint accepts an `image` file field and optional `num_colors` integer (5–20, default 8). Returns JSON with a `colors` array containing `hex`, `rgb`, `hsl`, `name`, and `percentage` for each extracted color.

## Project Structure
```
hueristic-image-color-extractor-app/
├── app.py                 # Flask app — routes, upload handling, error handlers
├── extractor.py           # K-means extraction and color metadata logic
├── requirements.txt
├── Procfile               # Gunicorn entry point for Render
├── .python-version        # Python version pin for deployment
├── templates/
│   └── index.html         # Single-page UI with Jinja2
└── static/
    ├── css/
    │   └── style.css      # Full app styling with CSS custom properties
    ├── js/
    │   └── main.js        # Upload flow, extraction, rendering, exports
    ├── images/
    │   ├── samples/       # Four curated sample images
    │   └── og-preview.png # Open Graph social preview
    └── uploads/           # Temporary upload storage (auto-created, auto-cleaned)
```

## Design Decisions

**K-means over pure NumPy counting.** The course lesson used NumPy to count most-repeated RGB values. That approach returns near-duplicates of the dominant color on real photos (ten slightly different shades of the same sky). K-means clusters similar colors into groups and returns representative centers, producing visually distinct palettes — the same approach production color tools use.

**pycolornames over webcolors.** Started with `webcolors` (CSS3's ~140 named colors). Results were poor — a deep blue would come back as `lightseagreen` because that was the nearest CSS3 name by Euclidean distance, not because it was accurate. Switched to `pycolornames`, which uses Chirag Mehta's ntc.js database (~1,500 names sourced from designer palettes and historical color references). Names like "Pacific Blue," "Deep Cerulean," and "Tussock" replaced the generic CSS3 matches.

**Client-side exports.** All four export formats (HEX list, PNG, CSS, JSON) are generated entirely in the browser using JavaScript and the Canvas API. No extra backend routes, no round-trip, no server load — exports are instant.

**Fully self-contained backend.** No database, no external API calls, no authentication. The app accepts an upload, runs extraction, returns JSON, and cleans up the uploaded file via a `try/finally` block. Stateless and safe for ephemeral filesystems.

## Limitations
- Free-tier hosting spins down after 15 minutes of inactivity (first load after idle takes ~30–60s)
- Max upload size: 10MB
- Supported formats: PNG, JPG, JPEG, WebP
- GIFs and BMPs deliberately excluded — GIFs because only the first frame would be analyzed (misleading for animations), BMPs because they're often large and rarely used in modern workflows
- Color names are approximations from a curated library, not exact matches — HEX, RGB, and HSL values are always precise
- No persistent palette storage (exports are the persistence mechanism)

## Author
Ghaleb Khadra