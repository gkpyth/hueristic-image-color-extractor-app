"""
extractor.py

Core image color extraction logic for Hueristic.
Uses K-means clustering to identify dominant colors in an image,
then enriches each color with HEX, RGB, HSL, a human-readable name,
and its dominance percentage.
"""

from PIL import Image
import numpy as np
from scipy.constants import value
from sklearn.cluster import KMeans
import colorsys
import colornames

# ==================== HELPER FUNCTIONS ====================
def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    """
    Convert an (R, G, B) tuple to a HEX color string.

    Example: (255, 99, 71) -> "#ff6347"
    """
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


def rgb_to_hsl(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    """
    Convert an (R, G, B) tuple (0-255 range) to HSL (Hue, Saturation, Lightness).

    HSL is more intuitive for humans: hue is the "color" on a 360° wheel,
    saturation is vividness, lightness is how light/dark.

    Example: (255, 99, 71) -> (9, 100, 64) (a vivid coral)
    """
    r, g, b = rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0
    h, l, s = colorsys.rgb_to_hls(r, g, b)

    return round(h * 360), round(s * 100), round(l * 100)

def get_color_name(hex_code: str) -> str:
    """
    Return the closest human-readable name for a given HEX color code.

    Uses pycolornames, a database with ~1,500 named colors.
    Much richer than the CSS3 named colors (~140),
    so matches feel more accurate and designer-friendly.

    Example:    "#107bb1" -> "Allports"
                "#ff6347" -> "Tomato"
                "#3e3e3e" -> "Dune"
    """
    return colornames.find(hex_code)

def extract_colors(image_path: str, num_colors: int = 10) -> list[dict]:
    """
    Extract the most dominant colors from an image using K-means clustering.

    Args:
        image_path: Path to the image file on disk.
        num_colors: How many dominant colors to extract (default 10).

    Returns:
        A list of dicts, one per color, sorted by dominance (most dominant first).
        Each dict contains: hex, rgb, hsl, name, percentage.
    """
    # Load image, normalize, and convert to RGB
    image = Image.open(image_path).convert("RGB")

    # Resize large images to thumbnail size to speed up processing - K-means can be painfully slow
    image.thumbnail((200, 200))

    # Convert image to NumPy array of pixels
    pixels = np.array(image)

    # K-means expects a 2D array: 1 row per pixel, 3 columns (R, G, B) so gotta .reshape(-1, 3) to flatten
    pixels = pixels.reshape(-1, 3)

    # K-means clustering groups similar colors together into clusters. It takes n_clusters which is basically how many colors
    # random_state is for reproducibility and n-init is how many times to run it (avoids bad luck with random seeds)
    kmeans = KMeans(n_clusters=num_colors, random_state=42, n_init=10)
    kmeans.fit(pixels)

    cluster_centers = kmeans.cluster_centers_
    # Need a way to tell which cluster each belongs to - labels do that for me.
    labels = kmeans.labels_

    # labels is an array with one entry per pixel, indicating which cluster that pixel belongs to.
    # To get the percentages, we need to count how many times each cluster index appears.
    counts = np.bincount(labels)

    # Convert raw counts to percentages of total pixel count.
    percentages = (counts / len(labels)) * 100

    # Build the list of enriched color dicts
    colors = []
    for center, percentage, in zip(cluster_centers, percentages):
        rgb = tuple(int(round(value)) for value in center)

        hex_code = rgb_to_hex(rgb)
        hsl = rgb_to_hsl(rgb)
        name = get_color_name(hex_code)

        colors.append({
            "hex": hex_code,
            "rgb": rgb,
            "hsl": hsl,
            "name": name,
            "percentage": round(percentage, 2)
        })

    # Sort by dominance (most dominant first)
    colors.sort(key=lambda x: x["percentage"], reverse=True)

    return colors

if __name__ == "__main__":
    palette = extract_colors("test.jpg")
    for color in palette:
        print(f"{color['hex']}  |  RGB {color['rgb']}  |  HSL {color['hsl']}  |  {color['name']:<20}  |  {color['percentage']:>5.2f}%")

    # result = extract_colors("test.jpg")
    # for color, pct in result:
    #     print(f"RGB {color.astype(int)} -> {pct:.2f}%")
    # print(rgb_to_hex((16, 123, 177)))
    # print(rgb_to_hsl((16, 123, 177)))
    # print(get_color_name("#107bb1"))