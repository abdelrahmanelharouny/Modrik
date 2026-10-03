#!/usr/bin/env python3
"""Render the 17 HTML slides to a single pixel-perfect PDF companion.
Each slide is a 1280x720 page; fonts fully loaded before print; pages merged.
Output: /home/z/my-project/download/RequirementPilot_Defense_Briefing.pdf
"""
import glob
import tempfile
from playwright.sync_api import sync_playwright
from pypdf import PdfWriter

SLIDES = sorted(glob.glob("/home/z/my-project/download/slides/slide_*.html"))
OUT = "/home/z/my-project/download/RequirementPilot_Defense_Briefing.pdf"

writer = PdfWriter()
with tempfile.TemporaryDirectory() as td, sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    for i, src in enumerate(SLIDES, 1):
        page.goto(f"file://{src}", wait_until="networkidle")
        page.evaluate("document.fonts.ready.then(()=>{})")
        page.wait_for_timeout(600)
        pdf_path = f"{td}/s{i:02d}.pdf"
        page.pdf(
            path=pdf_path,
            width="1280px",
            height="720px",
            print_background=True,
            page_ranges="1",
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        writer.append(pdf_path)
        print(f"page {i:02d} <- {src.split('/')[-1]}")
    browser.close()

with open(OUT, "wb") as f:
    writer.write(f)
print(f"saved: {OUT} ({len(SLIDES)} pages)")
