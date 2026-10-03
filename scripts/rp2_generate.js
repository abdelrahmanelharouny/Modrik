// RequirementPilot — Expansion and Innovation Roadmap (.docx builder)
// Companion volume to the Project Analysis Report.
// Recipe: R1 cover (DM-1 Deep Cyan), 3-section structure (cover / Roman front matter / Arabic body)
// English formal report: Times New Roman, left-aligned body, pure black text, 1.3x line spacing.
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, PageNumber, NumberFormat, AlignmentType,
  HeadingLevel, WidthType, BorderStyle, ShadingType, SectionType,
  TableOfContents, TableLayoutType, PageOrientation,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

const A = require("./rp2_content1.js");
const B = require("./rp2_content2.js");

const ASSETS = "/home/z/my-project/download/assets_rp";
const OUT = "/home/z/my-project/download/RequirementPilot_Expansion_Roadmap.docx";

// ── Palette: DM-1 Deep Cyan (AI / tech report) ──
const P = {
  bg: "162235", accent: "37DCF2",
  titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078",
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
};
const HEADING_COLORS = { h1: "0A1628", h2: "14424E", h3: "1B6B7A" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

const FONT = { ascii: "Times New Roman", eastAsia: "SimSun" };
const HFONT = { ascii: "Times New Roman", eastAsia: "SimHei" };

// ── Cover title layout (width-aware for English) ──
function estimateTextWidth(text, pt) {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const isCJK = (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef);
    w += isCJK ? pt * 20 : pt * 11;
  }
  return w;
}
function splitTitleLinesEN(title, maxWidthTw, pt) {
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const wd of words) {
    const cand = cur ? cur + " " + wd : wd;
    if (!cur || estimateTextWidth(cand, pt) <= maxWidthTw) cur = cand;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && lines[lines.length - 1].length <= 4) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}
function calcTitleLayoutEN(title, maxWidthTw, preferredPt = 40, minPt = 24) {
  let pt = preferredPt, lines = [title];
  while (pt >= minPt) {
    lines = splitTitleLinesEN(title, maxWidthTw, pt);
    const fits = lines.every((l) => estimateTextWidth(l, pt) <= maxWidthTw);
    if (lines.length <= 3 && fits) break;
    pt -= 2;
  }
  return { titlePt: pt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Recipe R1: Pure Paragraph Cover (left-aligned) ──
function buildCoverR1(config) {
  const pal = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayoutEN(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: pal.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: pal.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: pal.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: pal.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: pal.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: pal.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: pal.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: pal.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: pal.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: pal.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body element builders ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, keepNext: true,
    spacing: { before: 400, after: 180, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: HEADING_COLORS.h1, font: HFONT })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, keepNext: true,
    spacing: { before: 280, after: 130, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: HEADING_COLORS.h2, font: HFONT })],
  });
}
function para(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 140 },
    children: [new TextRun({ text, size: 24, color: "000000", font: FONT })],
  });
}
function tableCaption(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 220, after: 100, line: 312 },
    children: [new TextRun({ text, bold: true, size: 21, color: "333333", font: FONT })],
  });
}
function buildTable(spec) {
  const { headers, rows, widths } = spec;
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((text, i) => new TableCell({
      children: [new Paragraph({
        spacing: { line: 276 },
        children: [new TextRun({ text, bold: true, size: 21, color: P.table.headerText, font: FONT })],
      })],
      shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((text, ci) => new TableCell({
      children: [new Paragraph({
        spacing: { line: 276 },
        children: [new TextRun({ text: String(text), size: 21, color: "1A1A1A", font: FONT })],
      })],
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : { type: ShadingType.CLEAR, fill: "FFFFFF" },
      margins: { top: 60, bottom: 60, left: 110, right: 110 },
      width: { size: widths[ci], type: WidthType.PERCENTAGE },
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}
function figureBlock(fileName, caption, displayWidth = 545) {
  const buf = fs.readFileSync(path.join(ASSETS, fileName));
  const dims = imageSize(buf);
  const displayHeight = Math.round(displayWidth * (dims.height / dims.width));
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 240, after: 80 },
      children: [new ImageRun({ data: buf, transformation: { width: displayWidth, height: displayHeight }, type: "png" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 240, line: 276 },
      children: [new TextRun({ text: caption, italics: true, size: 20, color: "555555", font: FONT })],
    }),
  ];
}

// ── Generic block renderer ──
function renderSection(S) {
  const out = [h1(S.title)];
  for (const b of S.blocks) {
    if (typeof b === "string") { out.push(para(b)); continue; }
    if (b.h2) { out.push(h2(b.h2)); continue; }
    if (b.table) { out.push(tableCaption(b.table.caption)); out.push(buildTable(b.table)); continue; }
    if (b.fig) { out.push(...figureBlock(b.fig.path, b.fig.caption, b.fig.width || 545)); continue; }
  }
  return out;
}

// ── Footers (marker colors let post-processing distinguish Roman vs Arabic) ──
function pageFooter(markerColor) {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: markerColor, font: FONT })],
    })],
  });
}
const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
    children: [new TextRun({ text: "RequirementPilot Expansion and Innovation Roadmap", size: 18, color: "808080", font: FONT })],
  })],
});

// ── Document ──
const pgSize = { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const coverConfig = {
  title: "RequirementPilot Expansion and Innovation Roadmap",
  subtitle: "Gap analysis, fourteen development ideas, and strategic modifications for a broader platform",
  englishLabel: "EXPANSION AND INNOVATION",
  metaLines: [
    "Companion volume to the RequirementPilot Project Analysis Report",
    "Basis: reference document of 30 September 2026 and the implemented MVP",
    "Prepared for: Graduation Project Supervisor and Committee",
    "Scope: Missing elements - Developments - Modifications - Sequencing",
    "Date: October 2026",
  ],
  footerLeft: "RequirementPilot Expansion and Innovation Roadmap",
  footerRight: "October 2026",
  palette: P,
};

const bodySections = [A.S1, A.S2, A.S3, A.S4, A.S5, B.S6, B.S7, B.S8, B.S9];
const bodyChildren = bodySections.flatMap(renderSection);

const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: HEADING_COLORS.h1, font: HFONT })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: FONT,
    })],
  }),
];

const doc = new Document({
  creator: "Independent Analysis",
  title: "RequirementPilot Expansion and Innovation Roadmap",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: "000000" },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: HFONT, size: 32, bold: true, color: HEADING_COLORS.h1 },
        paragraph: { spacing: { before: 400, after: 180, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: HFONT, size: 28, bold: true, color: HEADING_COLORS.h2 },
        paragraph: { spacing: { before: 280, after: 130, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: HFONT, size: 24, bold: true, color: HEADING_COLORS.h3 },
        paragraph: { spacing: { before: 200, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  sections: [
    { // Section 1: Cover — margin 0, no footer/header
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig),
    },
    { // Section 2: Front matter — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter("888887") },
      children: tocChildren,
    },
    { // Section 3: Body — Arabic numerals from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader },
      footers: { default: pageFooter("888888") },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE " + OUT + " (" + Math.round(buf.length / 1024) + " KB)");
});
