// ============================================
// 1. DOM REFERENCES
// Grab all the elements that will be interacted with, once, up front.
// Faster than repeatedly querying the DOM, and keeps code clean.
// Note-to-self: Review Kanban Task Manager app - same concept
// ============================================
const fileInput         = document.getElementById("file-input");
const uploadSection     = document.getElementById("upload-section");
const previewSection    = document.getElementById("preview-section");
const previewImage      = document.getElementById("preview-image");
const extractButton     = document.getElementById("extract-button");
const resetButton       = document.getElementById("reset-button");
const loadingSection    = document.getElementById("loading-section");
const paletteSection    = document.getElementById("palette-section");
const paletteGrid       = document.getElementById("palette-grid");
const toast             = document.getElementById("toast");
const numColorsSlider   = document.getElementById("num-colors-slider");
const numColorsValue    = document.getElementById("num-colors-value");
const paletteImage      = document.getElementById("palette-image");

// Keep a reference to the currently selected File object.
// This is needed when the user clicks "Extract colors" since the input's
// file list is cleared on reset, so hold an inner copy for the code to execute.
let selectedFile = null;


// ============================================
// 2. UTILITIES
// ============================================

/**
 * Show a short message in the bottom-center toast.
 * @param {string} message - Text to display
 * @param {boolean} isError - If true, applies the error style (red background)
 */
function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("visible");

    // Auto-hide after 2 seconds. clearTimeout prevents stacking
    // if multiple toasts fire in quick succession.
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => {
        toast.classList.remove("visible");
    }, 2000);
}

/**
 * Show one section and hide the others.
 * Keeps the UI in a clean single-state at any time.
 * @param {HTMLElement} sectionToShow
 */
function showSection(sectionToShow) {
    [uploadSection, previewSection, loadingSection, paletteSection]
        .forEach(section => {
            if (section === sectionToShow) {
                section.removeAttribute("hidden");
            } else {
                section.setAttribute("hidden", "");
            }
        });
}


// ============================================
// 3. FILE SELECTION
// ============================================

/**
 * Handle a selected file; from click, drop, or paste.
 * Sets the preview and transitions to the preview section.
 */
function handleFileSelection(file) {
    selectedFile = file;

    // Revoke any previous object URL before creating a new one, to avoid
    // memory leaks when users select multiple images in one session.
    if (previewImage.src && previewImage.src.startsWith("blob:")) {
        URL.revokeObjectURL(previewImage.src);
    }

    previewImage.src = URL.createObjectURL(file);
    showSection(previewSection);
}

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) handleFileSelection(file);
});


// --- Drag-and-drop support ---
// Attach these to uploadSection (the <section>) rather than the label,
// so the entire area, including padding and margins, accepts drops.

// Prevent the browser's default behavior for all four drag events.
// Without this, dropping a file anywhere on the page would navigate
// the browser to open that file. Definitely not what I want.
["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    uploadSection.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

// Add visual feedback when a file is hovering over the drop zone.
["dragenter", "dragover"].forEach(eventName => {
    uploadSection.addEventListener(eventName, () => {
        uploadSection.classList.add("drag-active");
    });
});

// Remove the highlight when the drag leaves or the drop completes.
["dragleave", "drop"].forEach(eventName => {
    uploadSection.addEventListener(eventName, () => {
        uploadSection.classList.remove("drag-active");
    });
});

// Handle the actual drop. Reuse the same logic as file-input change.
uploadSection.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Validate it's actually an image before proceeding.
    // Check MIME type here rather than extension for robustness.
    if (!file.type.startsWith("image/")) {
        showToast("Please drop an image file", true);
        return;
    }

    handleFileSelection(file);
});


// --- Paste-from-clipboard support ---
// Listens globally so users can paste from anywhere on the page.
// Works with images copied from screenshots, Figma, Photoshop, etc.
document.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Clipboard items can include many types (text, HTML, etc.).
    // We loop through looking for anything that's an image.
    for (const item of items) {
        if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
                handleFileSelection(file);
                showToast("Image pasted from clipboard");
                return;
            }
        }
    }
});


// ============================================
// 4. SAMPLE IMAGES
// One-click demos: fetch the sample file from /static, convert to
// a File object, and feed it through the normal selection flow.
// ============================================
document.querySelectorAll(".sample-thumb").forEach(thumb => {
    thumb.addEventListener("click", async () => {
        const src = thumb.dataset.src;

        try {
            // Fetch the image as binary data (a "blob" = Binary Large OBject).
            // Same-origin fetch, no CORS concerns since it's on our server.
            const response = await fetch(src);
            if (!response.ok) throw new Error("Failed to load sample");

            const blob = await response.blob();

            // Extract a filename from the URL path, e.g. "sunset.jpg" from
            // "/static/images/samples/sunset.jpg".
            const filename = src.split("/").pop();

            // Wrap the blob in a File object so it has a filename and type —
            // this makes it indistinguishable from a real upload downstream.
            const file = new File([blob], filename, { type: blob.type });

            handleFileSelection(file);

        } catch (error) {
            console.error("Sample load error:", error);
            showToast("Couldn't load sample image", true);
        }
    });
});


// ============================================
// 5. SLIDER
// Live-update the displayed number as the user drags.
// The actual value is read at extraction time.
// ============================================
numColorsSlider.addEventListener("input", () => {
    numColorsValue.textContent = numColorsSlider.value;
});


// ============================================
// 6. EXTRACTION
// ============================================

extractButton.addEventListener("click", async () => {
    if (!selectedFile) {
        showToast("Please select an image first", true);
        return;
    }

    showSection(loadingSection);

    // FormData is the browser's built-in way to build multipart/form-data
    // requests. It handles file encoding and correct Content-Type header
    // automatically; don't try to set Content-Type manually or it'll break.
    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("num_colors", numColorsSlider.value);

    try {
        const response = await fetch("/extract", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        // fetch() doesn't throw on HTTP errors (400, 500, etc.) - only on
        // network failures. Gotta check response.ok myself.
        if (!response.ok) {
            throw new Error(data.error || "Extraction failed");
        }

        paletteImage.src = previewImage.src;

        renderPalette(data.colors);
        showSection(paletteSection);

    } catch (error) {
        console.error("Extraction error:", error);
        showToast(error.message, true);
        showSection(previewSection);  // Return to preview so user can retry
    }
});


// ============================================
// 7. PALETTE RENDERING
// ============================================

/**
 * Render an array of color dicts as swatch cards in the palette grid.
 * @param {Array} colors - List of {hex, rgb, hsl, name, percentage} objects
 */
function renderPalette(colors) {
    // Keep a reference for the export buttons to access
    currentPalette = colors;

    // Clear any previous palette before rendering the new one.
    paletteGrid.innerHTML = "";

    colors.forEach(color => {
        const swatch = document.createElement("div");
        swatch.className = "swatch";
        swatch.dataset.hex = color.hex;  // Store hex for the click handler

        // Note-to-self: !IMPORTANT!
        // Building innerHTML via a template literal is readable and fine
        // for trusted data. If ever rendering user-supplied strings,
        // use textContent or a sanitizer instead, but all values here
        // come from my own backend.
        swatch.innerHTML = `
            <div class="swatch-color" style="background-color: ${color.hex};"></div>
            <div class="swatch-info">
                <div class="swatch-name">${color.name}</div>
                <div class="swatch-hex">${color.hex.toUpperCase()}</div>
                <div class="swatch-meta">
                    RGB ${color.rgb.join(", ")}<br>
                    HSL ${color.hsl[0]}°, ${color.hsl[1]}%, ${color.hsl[2]}%
                </div>
                <span class="swatch-percentage">${color.percentage.toFixed(1)}%</span>
            </div>
        `;

        // Click-to-copy: entire swatch is clickable, copies the HEX to clipboard.
        swatch.addEventListener("click", () => copyToClipboard(color.hex));

        paletteGrid.appendChild(swatch);
    });
}


// ============================================
// 8. CLIPBOARD
// ============================================

/**
 * Copy a string to the user's clipboard and show a toast confirmation.
 * Uses the modern Clipboard API (available in all modern browsers over HTTPS
 * or on localhost, which covers dev and prod environments).
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast(`Copied ${text.toUpperCase()}`);
    } catch (error) {
        console.error("Clipboard error:", error);
        showToast("Couldn't copy to clipboard", true);
    }
}


// ============================================
// 9. EXPORTS
// Central dispatcher for all palette export formats.
// Each format shares access to the most recent palette via a module-level
// variable so I don't have to pass it around.
// ============================================

// Holds the last-rendered palette so exports have something to work with.
// Updated inside renderPalette() below.
let currentPalette = [];

// Single event listener for all export buttons, using event delegation.
// The data-export attribute on each button tells which format to produce.
document.querySelector(".export-bar").addEventListener("click", (e) => {
    const button = e.target.closest(".export-button");
    if (!button) return;  // Click was on the label or empty space, ignore

    const format = button.dataset.export;

    if (!currentPalette.length) {
        showToast("No palette to export", true);
        return;
    }

    switch (format) {
        case "hex":
            exportHexList();
            break;
        case "png":
            exportPng();
            break;
        case "css":
            exportCss();
            break;
        case "json":
            exportJson();
            break;
    }
});

/**
 * Copy a comma-separated list of HEX codes to the clipboard.
 * Example: "#179ccb, #6ecee4, #117cb1, ..."
 */
function exportHexList() {
    const hexList = currentPalette
        .map(color => color.hex.toUpperCase())
        .join(", ");

    navigator.clipboard.writeText(hexList)
        .then(() => showToast(`Copied ${currentPalette.length} HEX codes`))
        .catch(() => showToast("Couldn't copy to clipboard", true));
}


/**
 * Download the current palette as a PNG image.
 *
 * Layout: 5-column grid with gaps between swatches, rounded corners on
 * each card, and a solid warm background behind everything
 */
function exportPng() {
    // --- Canvas dimensions and layout constants ---
    const COLS           = 5;
    const ROWS           = Math.ceil(currentPalette.length / COLS);
    const CANVAS_WIDTH   = 1200;
    const HEADER_HEIGHT  = 120;
    const OUTER_PADDING  = 40;   // White space around the entire grid
    const GUTTER         = 20;   // White space between swatch cards
    const CARD_RADIUS    = 12;   // Rounded corners on each swatch card
    const SWATCH_COLOR_H = 220;
    const SWATCH_LABEL_H = 80;
    const SWATCH_H       = SWATCH_COLOR_H + SWATCH_LABEL_H;

    // Available width for the grid = canvas minus outer padding on both sides
    const GRID_WIDTH     = CANVAS_WIDTH - (OUTER_PADDING * 2);
    // Each swatch width = grid width, minus total gutters between cols, divided evenly
    const SWATCH_W       = (GRID_WIDTH - (GUTTER * (COLS - 1))) / COLS;

    // Canvas height = header + outer top padding + rows with gutters between + outer bottom padding
    const CANVAS_HEIGHT  = HEADER_HEIGHT
                         + OUTER_PADDING
                         + (ROWS * SWATCH_H)
                         + ((ROWS - 1) * GUTTER)
                         + OUTER_PADDING;

    // --- Create an off-screen canvas and get its 2D drawing context ---
    const canvas = document.createElement("canvas");
    canvas.width  = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");

    // --- Fill with a rounded background ---
    // Canvas defaults to transparent. We draw a rounded rect filling
    // (almost) the whole canvas as the background so the final PNG has
    // soft corners rather than hard edges.
    const BG_RADIUS = 24;
    drawRoundedRect(
        ctx, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT,
        { tl: BG_RADIUS, tr: BG_RADIUS, br: BG_RADIUS, bl: BG_RADIUS }
    );
    ctx.fillStyle = "#F7F5F2";
    ctx.fill();

    // --- Draw the header ---
    // "Hue" gets the hue gradient (matching the site logo), "ristic" gets
    // the regular text color. We draw them as two separate fillText calls
    // since they need different fill styles.
    ctx.font = "700 48px 'Syne', sans-serif";
    ctx.textBaseline = "middle";

    // Measure "Hue" so we know where "ristic" starts after it.
    const hueText = "Hue";
    const risticText = "ristic";
    const hueWidth = ctx.measureText(hueText).width;

    // Build the linear gradient for "Hue". Canvas gradients are defined
    // by start and end points - we use a 135deg-style diagonal by offsetting
    // the end point both right and down relative to the start.
    const logoX = OUTER_PADDING;
    const logoY = HEADER_HEIGHT / 2;
    const gradient = ctx.createLinearGradient(
        logoX, logoY - 24,                    // Top-left of the text
        logoX + hueWidth, logoY + 24          // Bottom-right of the text
    );
    gradient.addColorStop(0.00, "#C4622D");   // Terracotta
    gradient.addColorStop(0.35, "#D89242");   // Ochre
    gradient.addColorStop(0.65, "#B8524E");   // Dusty rose
    gradient.addColorStop(1.00, "#4A5880");   // Indigo

    // Draw "Hue" with the gradient fill
    ctx.fillStyle = gradient;
    ctx.fillText(hueText, logoX, logoY);

    // Draw "ristic" immediately after, in the regular near-black
    ctx.fillStyle = "#1C1C1C";
    ctx.fillText(risticText, logoX + hueWidth, logoY);

    // Subtitle on the right
    ctx.fillStyle = "#6B6864";
    ctx.font = "400 20px 'DM Sans', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
        `${currentPalette.length}-color palette`,
        CANVAS_WIDTH - OUTER_PADDING,
        HEADER_HEIGHT / 2
    );
    ctx.textAlign = "left";

    // --- Draw each swatch card as a rounded rectangle ---
    currentPalette.forEach((color, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);

        // Card position factors in outer padding + gutters
        const x = OUTER_PADDING + (col * (SWATCH_W + GUTTER));
        const y = HEADER_HEIGHT + OUTER_PADDING + (row * (SWATCH_H + GUTTER));

        // Draw the top portion (color block) with rounded top corners only
        drawRoundedRect(
            ctx, x, y, SWATCH_W, SWATCH_COLOR_H,
            { tl: CARD_RADIUS, tr: CARD_RADIUS, br: 0, bl: 0 }
        );
        ctx.fillStyle = color.hex;
        ctx.fill();

        // Draw the bottom portion (label area) with rounded bottom corners only
        drawRoundedRect(
            ctx, x, y + SWATCH_COLOR_H, SWATCH_W, SWATCH_LABEL_H,
            { tl: 0, tr: 0, br: CARD_RADIUS, bl: CARD_RADIUS }
        );
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        // Color name
        ctx.fillStyle = "#1C1C1C";
        ctx.font = "600 18px 'DM Sans', sans-serif";
        ctx.fillText(color.name, x + 20, y + SWATCH_COLOR_H + 30);

        // Hex code
        ctx.fillStyle = "#6B6864";
        ctx.font = "400 16px 'JetBrains Mono', monospace";
        ctx.fillText(color.hex.toUpperCase(), x + 20, y + SWATCH_COLOR_H + 58);
    });

    // --- Export as PNG blob ---
    canvas.toBlob((blob) => {
        if (!blob) {
            showToast("Failed to generate PNG", true);
            return;
        }
        downloadFile(blob, "hueristic-palette.png", "image/png");
        showToast("Palette PNG downloaded");
    }, "image/png");
}

/**
 * Draw a rounded rectangle path on the canvas context.
 * Doesn't fill or stroke - the caller does that after calling this function.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x, y, w, h - rectangle position and size
 * @param {Object} radii - per-corner radii: { tl, tr, br, bl }
 */
function drawRoundedRect(ctx, x, y, w, h, radii) {
    const { tl, tr, br, bl } = radii;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
}


/**
 * Download the current palette as a CSS file with custom properties.
 * Developers can drop this directly into a project and reference colors
 * via var(--hueristic-color-1), etc.
 *
 * Output includes both :root variables and a usage comment block so the
 * file is self-documenting when opened standalone.
 */
function exportCss() {
    // Build a header comment explaining what this file is and how to use it.
    // The comment survives as is into the downloaded CSS file.
    const header = [
        "/**",
        " * Color palette generated by Hueristic",
        ` * Generated: ${new Date().toISOString()}`,
        ` * Colors: ${currentPalette.length}`,
        " *",
        " * Usage:",
        " *   Import or paste this file, then reference variables:",
        " *   background: var(--hueristic-color-1);",
        " *   color: var(--hueristic-color-accent);  /* alias for color-1 */",
        " */",
        ""
    ].join("\n");

    // Build the :root block with one variable per color.
    // Each variable gets a trailing comment with the color's name and
    // dominance percentage, so the file is self-documenting.
    const variableLines = currentPalette.map((color, i) => {
        const index = i + 1;  // 1-indexed for readability
        const comment = `  /* ${color.name} | ${color.percentage.toFixed(1)}% */`;
        return `    --hueristic-color-${index}: ${color.hex};${comment}`;
    });

    // The most dominant color gets an --accent alias - it's likely what
    // a dev would want as a quick-grab "the main color of this image".
    const accentAlias = `    --hueristic-color-accent: var(--hueristic-color-1);`;

    // Assemble the final CSS body.
    const css = [
        header,
        ":root {",
        ...variableLines,
        "",
        accentAlias,
        "}",
        ""
    ].join("\n");

    downloadFile(css, "hueristic-palette.css", "text/css");
    showToast("Palette CSS downloaded");
}


/**
 * Download the current palette as a structured JSON file.
 * Useful for archiving, programmatic re-import, or handing off to tools
 * that accept JSON color data.
 */
function exportJson() {
    // Wrap the raw palette in a small metadata envelope so the file is
    // self-describing; useful if someone opens it months later.
    const exportData = {
        generated_at: new Date().toISOString(),
        generated_by: "Hueristic",
        palette_size: currentPalette.length,
        colors: currentPalette
    };

    // JSON.stringify with indent=2 produces human-readable output.
    // If we ever wanted to minimize file size, we'd drop the indent.
    const json = JSON.stringify(exportData, null, 4);

    downloadFile(json, "hueristic-palette.json", "application/json");
    showToast("Palette JSON downloaded");
}


/**
 * Trigger a browser download of arbitrary text content as a file.
 * Used by JSON, CSS, and (later) PNG exports.
 *
 * @param {string|Blob} content - The content to download
 * @param {string} filename - Name the file will save as
 * @param {string} mimeType - MIME type for the blob (ignored if content is already a Blob)
 */
function downloadFile(content, filename, mimeType) {
    // If it's already a Blob (PNG path), use it directly. Otherwise wrap.
    const blob = content instanceof Blob
        ? content
        : new Blob([content], { type: mimeType });

    // Create a temporary object URL for the blob, attach it to a hidden
    // anchor, click it programmatically, then clean up. This is the
    // standard JS pattern for triggering downloads client-side.
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    // The anchor doesn't need to be in the DOM for .click() to work in
    // modern browsers, but appending + removing is safer across older ones.
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke the URL after a short delay to allow the download to start.
    // Without this, memory leaks on repeated exports.
    setTimeout(() => URL.revokeObjectURL(url), 100);
}


// ============================================
// 10. RESET
// ============================================

function resetApp() {
    selectedFile = null;
    fileInput.value = "";
    currentPalette = []

    // Revoke the blob URL to free memory the browser held for the preview.
    if (previewImage.src && previewImage.src.startsWith("blob:")) {
        URL.revokeObjectURL(previewImage.src);
        previewImage.src = "";
    }

    paletteImage.src = "";

    showSection(uploadSection);
}

resetButton.addEventListener("click", resetApp);
document.getElementById("palette-reset-button").addEventListener("click", resetApp);