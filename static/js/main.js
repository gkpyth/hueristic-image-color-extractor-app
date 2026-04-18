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
// 9. RESET
// ============================================

function resetApp() {
    selectedFile = null;
    fileInput.value = "";

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