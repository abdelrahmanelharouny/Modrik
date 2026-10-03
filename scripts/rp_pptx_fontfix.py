#!/usr/bin/env python3
"""Post-process the RequirementPilot defense briefing PPTX.

Replace 'Liberation Sans Narrow' (the converter's substitute for Inter; absent
on most systems) with 'Arial' (metric-stable on LibreOffice via Liberation Sans
substitution, and native on MS Office). Geometry and sz values from the
converter are already consistent at the 0.5625 canvas scale — verified against
lnSpc and box extents; do NOT scale sz. Rewrites the file in place.
"""
import shutil
import sys
import zipfile

TARGET = "Liberation Sans Narrow"
REPLACEMENT = "Arial"


def fix(path: str) -> None:
    tmp = path + ".tmp"
    replaced = 0
    with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(
        tmp, "w", zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.startswith("ppt/") and item.filename.endswith(".xml"):
                text = data.decode("utf-8")
                count = text.count(TARGET)
                if count:
                    text = text.replace(TARGET, REPLACEMENT)
                    replaced += count
                data = text.encode("utf-8")
            zout.writestr(item, data)
    shutil.move(tmp, path)
    print(f"replaced {replaced} font name(s) in {path}")


if __name__ == "__main__":
    fix(sys.argv[1] if len(sys.argv) > 1 else
        "/home/z/my-project/download/RequirementPilot_Defense_Briefing.pptx")
