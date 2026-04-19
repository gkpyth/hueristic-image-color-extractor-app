"""
app.py

Flask application entry point for Hueristic.
Handles routing, file uploads, and serves the extracted color palette as JSON to the frontend.
"""


import os
import uuid
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

from extractor import extract_colors

from datetime import datetime

load_dotenv()

# Flask app configuration
app = Flask(__name__)

UPLOAD_FOLDER = os.path.join(app.root_path, "static", "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024         # 10 MB in bytes should be plenty

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def is_allowed_file(filename: str) -> bool:
    """
    Check if an uploaded file has an allowed extension.

    Returns False for files with no extension or a disallowed one.
    """
    return (
        "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


@app.route("/")
def index():
    """
    Serve the main page.
    """
    return render_template("index.html", current_year=datetime.now().year)


@app.route("/extract", methods=["POST"])
def extract():
    """
    Handle image upload and return the extracted color palette as JSON.

    Expects:
        - A multipart/form-data POST with an "image" file field
        - An optional "num_colors" form field (integer, 5-20, default 8)

    Returns:
        JSON with either:
            { "colors": [ {hex, rgb, hsl, name, percentage}, ... ] }
        or on error:
            { "error": "message" } with an appropriate HTTP status code.
    """
    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not is_allowed_file(file.filename):
        return jsonify({"error": f"Invalid file type. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    try:
        num_colors = int(request.form.get("num_colors", 8))
    except ValueError:
        return jsonify({"error": "Number of colors must be an integer"}), 400

    if not 5 <= num_colors <= 20:
        return jsonify({"error": "Number of colors must be between 5 and 20"}), 400


    original_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex}_{original_name}"         # Prevents two files with the same name from being uploaded e.g., "photo.jpg"
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)

    file.save(save_path)

    try:
        palette = extract_colors(save_path, num_colors=num_colors)
        return jsonify({"colors": palette})
    except Exception as e:
        app.logger.error(f"Extraction failed: {e}")
        return jsonify({"error": "Failed to process image"}), 500
    finally:
        if os.path.exists(save_path):
            os.remove(save_path)


@app.errorhandler(413)
def handle_file_too_large(error):
    """
    Return a clean JSON response when an uploaded file exceeds MAX_CONTENT_LENGTH.
    Without this, Flask returns a default HTML error page that our frontend can't parse.
    """
    max_mb = app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return jsonify({
        "error": f"File too large. Maximum size is {max_mb}MB."
    }), 413


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")