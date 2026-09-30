#!/usr/bin/env python3
"""Post-process the generated docx:
1. Remove empty <w:pgNumType/> from document.xml (confuses WPS on cover section).
2. Patch footer PAGE fields with explicit format switches:
   - footer containing marker color 888887 -> PAGE \\* ROMAN \\* MERGEFORMAT
   - footer containing marker color 888888 -> PAGE \\* arabic \\* MERGEFORMAT
"""
import re
import shutil
import zipfile
import os

SRC = "/home/z/my-project/download/RequirementPilot_Project_Analysis.docx"
TMP = SRC + ".tmp"

with zipfile.ZipFile(SRC, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

# 1. document.xml: strip empty pgNumType
doc = data["word/document.xml"].decode("utf-8")
before = doc.count("<w:pgNumType/>")
doc = doc.replace("<w:pgNumType/>", "")
data["word/document.xml"] = doc.encode("utf-8")
print(f"document.xml: removed {before} empty pgNumType")

# 2. footers: patch instrText
patched = []
for n in names:
    if re.match(r"word/footer\d+\.xml", n):
        xml = data[n].decode("utf-8")
        if "888887" in xml:
            fmt = "ROMAN"
        elif "888888" in xml:
            fmt = "arabic"
        else:
            continue
        new_xml, cnt = re.subn(
            r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
            rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2",
            xml,
        )
        if cnt:
            data[n] = new_xml.encode("utf-8")
            patched.append(f"{n} -> {fmt} ({cnt} field(s))")

print("patched footers:")
for p in patched:
    print("  " + p)

with zipfile.ZipFile(TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])

shutil.move(TMP, SRC)
print("OK post-processing complete:", os.path.getsize(SRC) // 1024, "KB")
