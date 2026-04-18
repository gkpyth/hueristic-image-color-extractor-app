// ============================================
// 1. DOM REFERENCES
// Grab all the elements that will be interacted with, once, up front.
// Faster than repeatedly querying the DOM, and keeps code clean.
// Note-to-self: Review Kanban Task Manager app - same concept
// ============================================
const fileInput      = document.getElementById("file-input");
const uploadSection  = document.getElementById("upload-section");
const previewSection = document.getElementById("preview-section");
const previewImage   = document.getElementById("preview-image");
const extractButton  = document.getElementById("extract-button");
const resetButton    = document.getElementById("reset-button");
const loadingSection = document.getElementById("loading-section");
const paletteSection = document.getElementById("palette-section");
const paletteGrid    = document.getElementById("palette-grid");
const toast          = document.getElementById("toast");

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

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    selectedFile = file;

    // Create a temporary URL pointing to the file in the browser's memory.
    // No upload happens yet. This is just for the preview image.
    // URL.createObjectURL is instant and doesn't touch the network.
    previewImage.src = URL.createObjectURL(file);

    showSection(previewSection);
});


// ============================================
// 4. EXTRACTION
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
    formData.append("num_colors", "10");

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

        renderPalette(data.colors);
        showSection(paletteSection);

    } catch (error) {
        console.error("Extraction error:", error);
        showToast(error.message, true);
        showSection(previewSection);  // Return to preview so user can retry
    }
});


// ============================================
// 5. PALETTE RENDERING
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
// 6. CLIPBOARD
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
// 7. RESET
// ============================================

function resetApp() {
    selectedFile = null;
    fileInput.value = "";

    // Revoke the blob URL to free memory the browser held for the preview.
    if (previewImage.src) {
        URL.revokeObjectURL(previewImage.src);
        previewImage.src = "";
    }

    showSection(uploadSection);
}

resetButton.addEventListener("click", resetApp);
document.getElementById("palette-reset-button").addEventListener("click", resetApp);