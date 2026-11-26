#!/usr/bin/env python3
"""Generate publication-ready figures for ICCIT 2026 Paper #2056 into figures-v2/.

Reads verified experiment measurements directly from
ops/results/reviewer-experiments/03..07*.json and writes vector PDF, SVG,
and 300-DPI PNG files into final-paper/IEEE-conference-template-062824/figures-v2/
without modifying any file in figures/ or iccit2026-paper.tex.
"""

from __future__ import annotations

import html
import json
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np

FIG_DIR = Path(__file__).resolve().parent
PAPER_DIR = FIG_DIR.parent
REPO_ROOT = PAPER_DIR.parent.parent
RESULTS_DIR = REPO_ROOT / "ops" / "results" / "reviewer-experiments"

# Palette matching iccit2026-paper.tex
BLUE = "#235B85"
BLUE_BG = "#EAF2F8"
TEAL = "#237469"
TEAL_BG = "#E8F5F3"
AMBER = "#AB6A1D"
AMBER_BG = "#FDF4E7"
RED = "#9E3030"
RED_BG = "#FCEAEA"
GRAY = "#F4F6F8"
GRAY_HEADER = "#ECEFF2"
BORDER = "#90A4AE"
INK = "#273238"
MUTED = "#546E7A"
GRID = "#E1E6EB"

plt.rcParams.update(
    {
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "svg.fonttype": "none",
        "font.family": "sans-serif",
        "font.sans-serif": ["Liberation Sans", "Arial", "DejaVu Sans"],
        "axes.edgecolor": "#455A64",
        "axes.linewidth": 0.8,
        "axes.labelsize": 9.0,
        "axes.titlesize": 9.5,
        "xtick.labelsize": 8.2,
        "ytick.labelsize": 8.2,
        "legend.fontsize": 8.0,
        "text.color": INK,
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
    }
)


def load_json(name: str) -> dict:
    path = RESULTS_DIR / name
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def fmt_sec(ms: float, decimals: int = 2) -> str:
    q = Decimal(10) ** -decimals
    val = (Decimal(str(ms)) / Decimal("1000")).quantize(q, rounding=ROUND_HALF_UP)
    return f"{val:.{decimals}f}"


def render_svg_bundle(stem: str, svg_text: str) -> None:
    svg_path = FIG_DIR / f"{stem}.svg"
    pdf_path = FIG_DIR / f"{stem}.pdf"
    png_path = FIG_DIR / f"{stem}.png"
    svg_path.write_text(svg_text, encoding="utf-8")
    subprocess.run(
        ["inkscape", str(svg_path), "--export-type=pdf", f"--export-filename={pdf_path}"],
        check=True,
        capture_output=True,
        text=True,
    )
    # Render PNG from the exported PDF via pdftoppm so we inspect the exact vector PDF glyphs/layout
    subprocess.run(
        ["pdftoppm", "-png", "-r", "300", "-singlefile", str(pdf_path), str(FIG_DIR / stem)],
        check=True,
        capture_output=True,
        text=True,
    )
    assert png_path.exists() and pdf_path.exists()


def style_axes(ax: plt.Axes) -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(True, axis="both", color=GRID, linewidth=0.65, linestyle="-", zorder=0)
    ax.set_axisbelow(True)


def save_matplotlib_bundle(fig: plt.Figure, stem: str) -> None:
    pdf_path = FIG_DIR / f"{stem}.pdf"
    svg_path = FIG_DIR / f"{stem}.svg"
    fig.savefig(pdf_path, bbox_inches="tight", pad_inches=0.06)
    fig.savefig(svg_path, bbox_inches="tight", pad_inches=0.06)
    # Inspect the exact vector PDF rasterized at 300 DPI
    subprocess.run(
        ["pdftoppm", "-png", "-r", "300", "-singlefile", str(pdf_path), str(FIG_DIR / stem)],
        check=True,
        capture_output=True,
        text=True,
    )
    plt.close(fig)


# ---------------------------------------------------------------------------
# SVG helpers
# ---------------------------------------------------------------------------
SVG_DEFS = f"""
<defs>
  <style>
    .t {{ font-family: 'Liberation Sans', Arial, sans-serif; fill: {INK}; }}
    .hdr {{ font-family: 'Liberation Sans', Arial, sans-serif; fill: #FFFFFF; font-weight: 700; }}
    .mut {{ font-family: 'Liberation Sans', Arial, sans-serif; fill: {MUTED}; }}
  </style>
  <marker id="arr-ink" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="{INK}"/>
  </marker>
  <marker id="arr-blue" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="{BLUE}"/>
  </marker>
  <marker id="arr-amber" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="{AMBER}"/>
  </marker>
  <marker id="arr-muted" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
    <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="{MUTED}"/>
  </marker>
</defs>
"""


def svg_box(
    x: float,
    y: float,
    w: float,
    h: float,
    title: str,
    subtitle: str | None = None,
    *,
    fill: str = "#FFFFFF",
    stroke: str = BORDER,
    sw: float = 1.1,
    rx: float = 3.0,
    dash: str | None = None,
    title_color: str = INK,
    sub_color: str = MUTED,
    fs_title: float = 9.5,
    fs_sub: float = 8.2,
    bold_title: bool = True,
) -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    fw = "700" if bold_title else "400"
    cx = x + w / 2.0
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash_attr}/>'
    ]
    if subtitle:
        y1 = y + h * 0.40 + fs_title * 0.30
        y2 = y + h * 0.74 + fs_sub * 0.28
        parts.append(
            f'<text x="{cx}" y="{y1:.1f}" text-anchor="middle" class="t" '
            f'font-size="{fs_title}" font-weight="{fw}" style="fill:{title_color}">{esc(title)}</text>'
        )
        parts.append(
            f'<text x="{cx}" y="{y2:.1f}" text-anchor="middle" class="t" '
            f'font-size="{fs_sub}" style="fill:{sub_color}">{esc(subtitle)}</text>'
        )
    else:
        y1 = y + h * 0.50 + fs_title * 0.34
        parts.append(
            f'<text x="{cx}" y="{y1:.1f}" text-anchor="middle" class="t" '
            f'font-size="{fs_title}" font-weight="{fw}" style="fill:{title_color}">{esc(title)}</text>'
        )
    return "\n".join(parts)


def svg_container(
    x: float,
    y: float,
    w: float,
    h: float,
    header_text: str,
    *,
    header_fill: str,
    body_fill: str = "#FFFFFF",
    stroke: str | None = None,
    header_h: float = 22.0,
    fs: float = 9.8,
) -> str:
    st = stroke or header_fill
    cx = x + w / 2.0
    hy = y + header_h * 0.50 + fs * 0.34
    return "\n".join(
        [
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3.5" '
            f'fill="{body_fill}" stroke="{st}" stroke-width="1.35"/>',
            f'<path d="M {x+3.5} {y} H {x+w-3.5} Q {x+w} {y} {x+w} {y+3.5} '
            f'V {y+header_h} H {x} V {y+3.5} Q {x} {y} {x+3.5} {y} Z" fill="{header_fill}"/>',
            f'<text x="{cx}" y="{hy:.1f}" text-anchor="middle" class="hdr" '
            f'font-size="{fs}">{esc(header_text)}</text>',
        ]
    )


def build_fig1_system_architecture() -> None:
    """Fig 1: Clean vector system architecture (double-column 7.0 x 3.36 in)."""
    W, H = 700, 336
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W/100:.2f}in" height="{H/100:.2f}in" viewBox="0 0 {W} {H}">',
        SVG_DEFS,
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
    ]

    # Top bar: Reachability progression
    parts.append(
        f'<text x="12" y="16" class="t" font-size="9.5" font-weight="700">REACHABILITY REGIMES</text>'
    )
    levels = [
        (12, 110, "L0 · GLOBAL", BLUE, "#FFFFFF", BLUE, False),
        (146, 114, "L1 · NATIONAL", BLUE, "#FFFFFF", BLUE, False),
        (284, 116, "L2 · ISP ISLAND", BLUE, "#FFFFFF", BLUE, False),
        (424, 116, "L3 · BRIDGED", AMBER, AMBER_BG, AMBER, False),
        (566, 122, "L4 · ISOLATED", MUTED, GRAY, INK, True),
    ]
    for i, (lx, lw, label, st, bg, tc, is_dashed) in enumerate(levels):
        parts.append(
            svg_box(
                lx,
                22,
                lw,
                24,
                label,
                fill=bg,
                stroke=st,
                sw=1.6 if label.startswith("L3") else 1.15,
                dash="4,3" if is_dashed else None,
                title_color=tc,
                fs_title=9.3,
            )
        )
        if i < len(levels) - 1:
            nx = levels[i + 1][0]
            col = AMBER if i == 2 else (MUTED if i == 3 else BLUE)
            mk = "arr-amber" if i == 2 else ("arr-muted" if i == 3 else "arr-blue")
            da = ' stroke-dasharray="3.5,2.5"' if i == 3 else ""
            parts.append(
                f'<line x1="{lx+lw+2}" y1="34" x2="{nx-3}" y2="34" '
                f'stroke="{col}" stroke-width="1.35"{da} marker-end="url(#{mk})"/>'
            )

    # Scope bracket below L0..L3
    parts.append(f'<path d="M 12 49 V 53 H 540 V 49" fill="none" stroke="{MUTED}" stroke-width="0.95"/>')
    parts.append(
        '<rect x="172" y="48" width="208" height="14" fill="#FFFFFF"/>'
        f'<text x="276" y="57.5" text-anchor="middle" class="mut" font-size="8.8">evaluated IP federation scope: L0–L3</text>'
    )
    parts.append(
        f'<text x="627" y="57.5" text-anchor="middle" class="mut" font-size="8.8">out of scope</text>'
    )

    # Route-cut arch above S1 and S2
    # S1 center x=264, S2 center x=629
    parts.append(
        f'<path d="M 264 100 V 78 H 629 V 100" fill="none" stroke="{RED}" '
        f'stroke-width="1.45" stroke-dasharray="5,4"/>'
    )
    parts.append(
        f'<rect x="342" y="68" width="208" height="19" rx="3" fill="{RED_BG}" stroke="{RED}" stroke-width="1.0"/>'
    )
    parts.append(
        f'<text x="446" y="80.8" text-anchor="middle" class="t" font-size="9.2" font-weight="700" '
        f'style="fill:{RED}">&#x2715; direct IX path cut (withdrawn)</text>'
    )

    # Column geometry
    # C1: x=12, w=128 (12..140)
    # Gap1: 140..202 (62px)
    # S1: x=202, w=124 (202..326, center 264)
    # Gap2: 326..374 (48px)
    # S3: x=374, w=146 (374..520, center 447)
    # Gap3: 520..568 (48px)
    # S2: x=568, w=122 (568..690, center 629)

    # Client C1
    parts.append(svg_container(12, 100, 128, 136, "CLIENT C1", header_fill=INK, fs=9.5))
    parts.append(svg_box(20, 129, 112, 30, "Sign on Device", "canonical bytes", stroke=BLUE, fill=BLUE_BG, fs_title=9.0, fs_sub=8.0))
    parts.append(svg_box(20, 165, 112, 30, "Signed Receipt", "CID + leaf + STH", stroke=AMBER, fill=AMBER_BG, fs_title=9.0, fs_sub=8.0))
    parts.append(svg_box(20, 201, 112, 28, "Audit Certificate", "retained by client", stroke=BORDER, fill="#FFFFFF", fs_title=8.8, fs_sub=7.9))

    # S1 Island A
    parts.append(svg_container(202, 100, 124, 136, "S1 · ISLAND A", header_fill=BLUE, fs=9.5))
    parts.append(svg_box(210, 129, 108, 28, "19-Stage Admission", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(210, 165, 108, 28, "Store + Merkle Log", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(210, 201, 108, 28, "Durable Outbox", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(f'<line x1="264" y1="157" x2="264" y2="163" stroke="{BLUE}" stroke-width="1.2" marker-end="url(#arr-blue)"/>')
    parts.append(f'<line x1="264" y1="193" x2="264" y2="199" stroke="{BLUE}" stroke-width="1.2" marker-end="url(#arr-blue)"/>')

    # S3 Dual-Homed Bridge
    parts.append(svg_container(374, 100, 146, 152, "S3 · DUAL-HOMED BRIDGE", header_fill=AMBER, body_fill="#FFFDF9", fs=9.3))
    parts.append(svg_box(383, 128, 128, 24, "Uplink A + Uplink B", stroke=AMBER, fill=AMBER_BG, fs_title=8.9, title_color=AMBER))
    parts.append(svg_box(383, 159, 128, 24, "19-Stage Admission", stroke=AMBER, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(383, 190, 128, 24, "Store + Merkle Log", stroke=AMBER, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(383, 221, 128, 24, "Durable Outbox", stroke=AMBER, fill="#FFFFFF", fs_title=8.9))
    for yy in (152, 183, 214):
        parts.append(f'<line x1="447" y1="{yy}" x2="447" y2="{yy+5}" stroke="{AMBER}" stroke-width="1.2" marker-end="url(#arr-amber)"/>')

    # S2 Island B
    parts.append(svg_container(568, 100, 122, 136, "S2 · ISLAND B", header_fill=BLUE, fs=9.5))
    parts.append(svg_box(576, 129, 106, 28, "19-Stage Admission", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(576, 165, 106, 28, "Store + Merkle Log", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(svg_box(576, 201, 106, 28, "Durable Outbox", stroke=BLUE, fill="#FFFFFF", fs_title=8.9))
    parts.append(f'<line x1="629" y1="157" x2="629" y2="163" stroke="{BLUE}" stroke-width="1.2" marker-end="url(#arr-blue)"/>')
    parts.append(f'<line x1="629" y1="193" x2="629" y2="199" stroke="{BLUE}" stroke-width="1.2" marker-end="url(#arr-blue)"/>')

    # C1 <-> S1 arrows cleanly in Gap 1 (140..202)
    parts.append(f'<line x1="133" y1="143" x2="207" y2="143" stroke="{BLUE}" stroke-width="1.4" marker-end="url(#arr-blue)"/>')
    parts.append(
        f'<text x="171" y="135" text-anchor="middle" class="t" font-size="8.4" font-weight="700" style="fill:{BLUE}">HTTP bytes</text>'
    )
    parts.append(f'<line x1="209" y1="180" x2="135" y2="180" stroke="{AMBER}" stroke-width="1.4" marker-end="url(#arr-amber)"/>')
    parts.append(
        f'<text x="171" y="172" text-anchor="middle" class="t" font-size="8.4" font-weight="700" style="fill:{AMBER}">receipt</text>'
    )

    # S1 Outbox <-> S3 Uplink A+B (gRPC)
    parts.append(
        f'<path d="M 318 215 H 350 V 140 H 380" fill="none" stroke="{BLUE}" stroke-width="1.4" '
        f'marker-start="url(#arr-blue)" marker-end="url(#arr-blue)"/>'
    )
    parts.append('<rect x="331" y="168" width="38" height="15" rx="2" fill="#FFFFFF"/>')
    parts.append(
        f'<text x="350" y="178.5" text-anchor="middle" class="t" font-size="8.6" font-weight="700" style="fill:{BLUE}">gRPC</text>'
    )

    # S3 <-> S2 (gRPC)
    parts.append(
        f'<line x1="514" y1="140" x2="573" y2="140" stroke="{BLUE}" stroke-width="1.4" '
        f'marker-start="url(#arr-blue)" marker-end="url(#arr-blue)"/>'
    )
    parts.append(
        f'<text x="544" y="132" text-anchor="middle" class="t" font-size="8.6" font-weight="700" style="fill:{BLUE}">gRPC</text>'
    )

    # Note beneath S3
    parts.append(
        f'<text x="447" y="266" text-anchor="middle" class="mut" font-size="8.6">'
        f'Same 19-stage admission at every node (trust sets quota, never validity)</text>'
    )

    # Bottom Audit tier: dashed line from C1 Audit Certificate to ALS A & ALS B
    parts.append(
        f'<path d="M 76 230 V 278 H 555 V 290" fill="none" stroke="{INK}" stroke-width="1.2" '
        f'stroke-dasharray="4,3" marker-end="url(#arr-ink)"/>'
    )
    parts.append(
        f'<line x1="278" y1="278" x2="278" y2="290" stroke="{INK}" stroke-width="1.2" '
        f'stroke-dasharray="4,3" marker-end="url(#arr-ink)"/>'
    )
    parts.append('<rect x="86" y="269" width="174" height="14" fill="#FFFFFF"/>')
    parts.append(
        f'<text x="173" y="279" text-anchor="middle" class="mut" font-size="8.5" font-weight="700">'
        f'audit certificates · after acceptance</text>'
    )
    parts.append(
        svg_box(
            184,
            292,
            188,
            34,
            "ALS A (Independent Log)",
            "verify author sig, receipt, STH + chain",
            stroke=INK,
            fill=GRAY,
            fs_title=9.0,
            fs_sub=7.9,
        )
    )
    parts.append(
        svg_box(
            461,
            292,
            188,
            34,
            "ALS B (Independent Log)",
            "verify author sig, receipt, STH + chain",
            stroke=INK,
            fill=GRAY,
            fs_title=9.0,
            fs_sub=7.9,
        )
    )

    parts.append("</svg>")
    render_svg_bundle("fig1-system-architecture", "\n".join(parts))


def build_fig2_admission_pipeline() -> None:
    """Fig 2: 19-stage admission pipeline (single-column 3.60 x 3.74 in, D4+D5 aligned)."""
    W, H = 360, 374
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W/100:.2f}in" height="{H/100:.2f}in" viewBox="0 0 {W} {H}">',
        SVG_DEFS,
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
    ]

    # Top cards above the two pipeline columns
    parts.append(
        svg_box(
            52,
            6,
            256,
            34,
            "SIGNED ENVELOPE",
            "exact received canonical protobuf bytes",
            stroke=INK,
            fill="#FFFFFF",
            sw=1.25,
            fs_title=9.3,
            fs_sub=8.2,
        )
    )
    parts.append(f'<line x1="180" y1="40" x2="180" y2="49" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-ink)"/>')

    parts.append(
        svg_box(
            20,
            51,
            320,
            35,
            "TRANSPORT PRE-GATE · OUTSIDE PIPELINE",
            "HTTP client limiter   |   gRPC PeerQuotaLimiter",
            stroke=AMBER,
            fill=AMBER_BG,
            sw=1.25,
            dash="4,3",
            title_color=AMBER,
            sub_color=INK,
            fs_title=8.9,
            fs_sub=8.1,
        )
    )
    parts.append(
        f'<path d="M 180 86 V 94 H 88 V 101" fill="none" stroke="{INK}" stroke-width="1.3" marker-end="url(#arr-ink)"/>'
    )

    # Left column: Stages 1-12
    parts.append(svg_container(8, 103, 160, 263, "STAGES 1–12 · READ-ONLY", header_fill=BLUE, fs=8.9))
    parts.append(
        f'<rect x="9.5" y="125" width="157" height="16" fill="{BLUE_BG}"/>'
        f'<text x="88" y="136.0" text-anchor="middle" class="t" font-size="8.0" font-weight="700" style="fill:{BLUE}">0 persistent database writes</text>'
    )
    left_stages = [
        ("1–2 · BYTES", "size limit, parse, exact re-encode"),
        ("3–5 · ROUTING", "version, domain, plane"),
        ("6–7 · POLICY", "domain size, alg, priority"),
        ("8–10 · AUTH", "clock window, Ed25519 sig, cert"),
        ("11–12 · REPLAY", "CID dedupe (200), nonce (409)"),
    ]
    for idx, (st_title, st_sub) in enumerate(left_stages):
        sy = 147 + idx * 43
        parts.append(
            svg_box(
                16,
                sy,
                144,
                36,
                st_title,
                st_sub,
                stroke=BORDER,
                fill="#FFFFFF",
                sw=1.05,
                fs_title=8.6,
                fs_sub=7.8,
            )
        )
        if idx < len(left_stages) - 1:
            parts.append(
                f'<line x1="88" y1="{sy+36}" x2="88" y2="{sy+42}" stroke="{INK}" stroke-width="1.15" marker-end="url(#arr-ink)"/>'
            )

    # Right column: Stages 13-19
    parts.append(svg_container(192, 103, 160, 263, "STAGES 13–19 · COMMIT", header_fill=AMBER, fs=8.9))
    parts.append(
        f'<rect x="193.5" y="125" width="157" height="16" fill="{AMBER_BG}"/>'
        f'<text x="272" y="136.0" text-anchor="middle" class="t" font-size="8.0" font-weight="700" style="fill:{AMBER}">first DB mutation at Stage 13</text>'
    )
    right_stages = [
        ("13 · ANTI-ABUSE", "origin only (PoW / credits)", AMBER, AMBER_BG, AMBER),
        ("14–15 · SEMANTICS", "authorise (14), validate (15)", INK, "#FFFFFF", INK),
        ("16–18 · ATOMIC TX", "store, project, Merkle, sign", INK, "#FFFFFF", INK),
        ("19 · FAN-OUT", "durable outbox (excl. sender)", INK, "#FFFFFF", INK),
        ("SIGNED RECEIPT", "CID + leaf + STH + proof", TEAL, TEAL_BG, TEAL),
    ]
    for idx, (st_title, st_sub, sc, bg, tc) in enumerate(right_stages):
        sy = 147 + idx * 43
        parts.append(
            svg_box(
                200,
                sy,
                144,
                36,
                st_title,
                st_sub,
                stroke=sc,
                fill=bg,
                sw=1.4 if idx in (0, 4) else 1.05,
                title_color=tc,
                fs_title=8.6,
                fs_sub=7.8,
            )
        )
        if idx < len(right_stages) - 1:
            col = AMBER if idx == 3 else INK
            mk = "arr-amber" if idx == 3 else "arr-ink"
            parts.append(
                f'<line x1="272" y1="{sy+36}" x2="272" y2="{sy+42}" stroke="{col}" stroke-width="1.2" marker-end="url(#{mk})"/>'
            )

    # Dashed handoff connector from 11-12 (y=337) to 13 (y=165) in 24px channel (x=168..192)
    parts.append(
        f'<path d="M 160 337 H 180 V 165 H 198" fill="none" stroke="{INK}" '
        f'stroke-width="1.3" stroke-dasharray="4,3" marker-end="url(#arr-ink)"/>'
    )

    parts.append("</svg>")
    render_svg_bundle("fig2-admission-pipeline", "\n".join(parts))


def build_fig3_route_cut_topology(d03: dict) -> None:
    """Fig 3: Route-cut topology with N=20 repeated-trial summary (4.80 x 3.24 in)."""
    W, H = 480, 324
    intact = d03["intact"]["summary"]
    cut = d03["bridgedCut"]["summary"]
    n_trials = d03["trialsPerRegime"]

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W/100:.2f}in" height="{H/100:.2f}in" viewBox="0 0 {W} {H}">',
        SVG_DEFS,
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>',
    ]

    # IX Exchange box at top
    parts.append(
        svg_box(
            165,
            8,
            150,
            40,
            "IX EXCHANGE",
            "10.90.9.0/24",
            stroke=INK,
            fill="#FFFFFF",
            sw=1.2,
            dash="5,3",
            fs_title=10.8,
            fs_sub=9.8,
        )
    )
    # Dashed legs to Island A (x=62) and Island B (x=418)
    parts.append(
        f'<path d="M 165 28 H 62 V 76" fill="none" stroke="{AMBER}" stroke-width="1.5" stroke-dasharray="5,4"/>'
    )
    parts.append(
        f'<path d="M 315 28 H 418 V 76" fill="none" stroke="{AMBER}" stroke-width="1.5" stroke-dasharray="5,4"/>'
    )
    parts.append(
        f'<rect x="336" y="18" width="66" height="20" rx="3" fill="{RED_BG}" stroke="{RED}" stroke-width="1.05"/>'
    )
    parts.append(
        f'<text x="369" y="31.5" text-anchor="middle" class="t" font-size="10.2" font-weight="700" style="fill:{RED}">&#x2715; IX CUT</text>'
    )

    # Island A: x=8, w=108 (8..116)
    parts.append(svg_container(8, 76, 108, 148, "ISLAND A · .1.0/24", header_fill=BLUE, fs=9.8))
    parts.append(svg_box(16, 108, 92, 46, "A1", "IX peer (.1.10)", stroke=BLUE, fill="#FFFFFF", fs_title=10.5, fs_sub=9.4))
    parts.append(svg_box(16, 166, 92, 46, "A2", "local only", stroke=BLUE, fill="#FFFFFF", fs_title=10.5, fs_sub=9.4))

    # Dual-Homed Bridge: x=156, w=168 (156..324)
    parts.append(svg_container(156, 76, 168, 148, "DUAL-HOMED BRIDGE", header_fill=AMBER, body_fill="#FFFDF9", fs=9.8))
    parts.append(svg_box(164, 106, 72, 42, "UPLINK A", "10.90.1.30", stroke=AMBER, fill=AMBER_BG, fs_title=9.8, fs_sub=8.9, title_color=AMBER))
    parts.append(svg_box(244, 106, 72, 42, "UPLINK B", "10.90.2.30", stroke=AMBER, fill=AMBER_BG, fs_title=9.8, fs_sub=8.9, title_color=AMBER))

    # Bridge internal flow arrows
    parts.append(svg_box(162, 174, 48, 30, "Validate", stroke=AMBER, fill="#FFFFFF", fs_title=9.2))
    parts.append(svg_box(217, 174, 44, 30, "Store", stroke=AMBER, fill="#FFFFFF", fs_title=9.2))
    parts.append(svg_box(268, 174, 48, 30, "Outbox", stroke=AMBER, fill="#FFFFFF", fs_title=9.2))
    parts.append(f'<line x1="200" y1="148" x2="188" y2="172" stroke="{AMBER}" stroke-width="1.35" marker-end="url(#arr-amber)"/>')
    parts.append(f'<line x1="210" y1="189" x2="215" y2="189" stroke="{AMBER}" stroke-width="1.2" marker-end="url(#arr-amber)"/>')
    parts.append(f'<line x1="261" y1="189" x2="266" y2="189" stroke="{AMBER}" stroke-width="1.2" marker-end="url(#arr-amber)"/>')
    parts.append(f'<line x1="292" y1="174" x2="282" y2="150" stroke="{AMBER}" stroke-width="1.35" marker-end="url(#arr-amber)"/>')

    # Island B: x=364, w=108 (364..472)
    parts.append(svg_container(364, 76, 108, 148, "ISLAND B · .2.0/24", header_fill=BLUE, fs=9.8))
    parts.append(svg_box(372, 108, 92, 46, "B1", "IX peer (.2.10)", stroke=BLUE, fill="#FFFFFF", fs_title=10.5, fs_sub=9.4))
    parts.append(
        f'<text x="418" y="183" text-anchor="middle" class="mut" font-size="9.4">Direct route</text>'
        f'<text x="418" y="196" text-anchor="middle" class="mut" font-size="9.4">withdrawn mid-run</text>'
    )

    # Clean gRPC connectors in 40px gaps (116..156 and 324..364)
    parts.append(
        f'<line x1="108" y1="130" x2="162" y2="130" stroke="{BLUE}" stroke-width="1.5" '
        f'marker-start="url(#arr-blue)" marker-end="url(#arr-blue)"/>'
    )
    parts.append('<rect x="119" y="110" width="32" height="14" fill="#FFFFFF"/>')
    parts.append(f'<text x="135" y="120.5" text-anchor="middle" class="t" font-size="9.8" font-weight="700" style="fill:{BLUE}">gRPC</text>')

    parts.append(
        f'<line x1="316" y1="130" x2="370" y2="130" stroke="{BLUE}" stroke-width="1.5" '
        f'marker-start="url(#arr-blue)" marker-end="url(#arr-blue)"/>'
    )
    parts.append('<rect x="327" y="110" width="32" height="14" fill="#FFFFFF"/>')
    parts.append(f'<text x="343" y="120.5" text-anchor="middle" class="t" font-size="9.8" font-weight="700" style="fill:{BLUE}">gRPC</text>')

    # Bottom repeated-trial summary panel (from 03-route-cut-trials.json)
    ic, ik, ip, ispan = intact["certificateMs"], intact["communityMs"], intact["postMs"], intact["chainSpanMs"]
    cc, ck, cp, cspan = cut["certificateMs"], cut["communityMs"], cut["postMs"], cut["chainSpanMs"]
    intact_line = (
        f"IX intact ({ip['delivered']}/{ip['attempted']}):  "
        f"cert {fmt_sec(ic['median'])} s · comm {fmt_sec(ik['median'])} s · "
        f"post {fmt_sec(ip['median'])} s [{fmt_sec(ip['medianCi95'][0])}, {fmt_sec(ip['medianCi95'][1])}] · "
        f"chain {fmt_sec(ispan['median'])} s"
    )
    cut_line = (
        f"IX cut ({cp['delivered']}/{cp['attempted']}):     "
        f"cert {fmt_sec(cc['median'])} s · comm {fmt_sec(ck['median'])} s · "
        f"post {fmt_sec(cp['median'])} s [{fmt_sec(cp['medianCi95'][0])}, {fmt_sec(cp['medianCi95'][1])}] · "
        f"chain {fmt_sec(cspan['median'])} s"
    )

    parts.append(
        f'<rect x="8" y="236" width="464" height="80" rx="3.5" fill="#FFFFFF" stroke="{BORDER}" stroke-width="1.2"/>'
        f'<path d="M 11.5 236 H 468.5 Q 472 236 472 239.5 V 257 H 8 V 239.5 Q 8 236 11.5 236 Z" fill="{GRAY_HEADER}"/>'
        f'<text x="240" y="250.2" text-anchor="middle" class="t" font-size="9.8" font-weight="700">'
        f'REPEATED ROUTE-CUT TRIALS · N = {n_trials} EACH · 100% DELIVERY</text>'
    )
    parts.append(f'<circle cx="22" cy="272" r="4" fill="{BLUE}"/>')
    parts.append(f'<text x="32" y="275.5" class="t" font-size="9.7">{esc(intact_line)}</text>')
    parts.append(f'<circle cx="22" cy="291" r="4" fill="{AMBER}"/>')
    parts.append(f'<text x="32" y="294.5" class="t" font-size="9.7">{esc(cut_line)}</text>')
    parts.append(
        f'<text x="240" y="310.0" text-anchor="middle" class="mut" font-size="8.8">'
        f'Medians [95% bootstrap/order CI] from exact in-transaction received_at_ms deltas</text>'
    )

    parts.append("</svg>")
    render_svg_bundle("fig3-route-cut-topology", "\n".join(parts))


# ---------------------------------------------------------------------------
# Matplotlib charts (Figs 4-7)
# ---------------------------------------------------------------------------
def build_fig4_hop_and_drain_scaling(d06: dict) -> None:
    """Fig 4: 8-node hop scaling (with IQR + 95% CI + p95) & drain-interval sweep."""
    n8 = next(r for r in d06["runs"] if r["label"] == "nodecount_n8_d500")
    hops = np.array(sorted(int(h) for h in n8["hops"]))
    med = np.array([n8["hops"][str(h)]["median"] / 1000.0 for h in hops])
    p25 = np.array([n8["hops"][str(h)]["p25"] / 1000.0 for h in hops])
    p75 = np.array([n8["hops"][str(h)]["p75"] / 1000.0 for h in hops])
    p95 = np.array([n8["hops"][str(h)]["p95"] / 1000.0 for h in hops])
    ci_lo = med - np.array([n8["hops"][str(h)]["medianCi95"][0] / 1000.0 for h in hops])
    ci_hi = np.array([n8["hops"][str(h)]["medianCi95"][1] / 1000.0 for h in hops]) - med
    fit_slope = n8["linearFit"]["slope"] / 1000.0
    fit_int = n8["linearFit"]["intercept"] / 1000.0
    fit_r2 = n8["linearFit"]["r2"]

    # Drain sweep runs (control_start_n4_d500 serves as the 500 ms point)
    drain_runs = {
        r["drainMs"]: r["hops"]["3"]
        for r in d06["runs"]
        if r["label"] in ("drain_n4_d250", "control_start_n4_d500", "drain_n4_d1000", "drain_n4_d2000")
    }
    drains = np.array(sorted(drain_runs))
    d_med = np.array([drain_runs[d]["median"] / 3.0 for d in drains])
    d_p25 = np.array([drain_runs[d]["p25"] / 3.0 for d in drains])
    d_p75 = np.array([drain_runs[d]["p75"] / 3.0 for d in drains])
    reg = d06["drainIntervalRegression"]["fit"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.1, 2.3), gridspec_kw={"wspace": 0.34})

    # Panel (a)
    style_axes(ax1)
    ax1.fill_between(hops, p25, p75, color=BLUE, alpha=0.16, label="IQR (p25–p75)")
    ax1.errorbar(
        hops,
        med,
        yerr=[ci_lo, ci_hi],
        color=BLUE,
        marker="o",
        markersize=4.5,
        linewidth=1.7,
        capsize=2.5,
        elinewidth=1.0,
        label="Median ± 95% CI",
        zorder=4,
    )
    ax1.plot(
        hops,
        p95,
        color=AMBER,
        linestyle="--",
        marker="^",
        markersize=4.3,
        linewidth=1.45,
        label="95th percentile",
        zorder=3,
    )
    fit_x = np.linspace(1, 7, 50)
    ax1.plot(
        fit_x,
        fit_slope * fit_x + fit_int,
        color=INK,
        linestyle=":",
        linewidth=1.1,
        label=f"Fit: {fit_slope*1000:.1f} ms/hop (R²={fit_r2:.3f})",
        zorder=2,
    )
    ax1.set_title("(a) 8-Node Chain (drain = 500 ms, N = 50)", fontweight="bold", fontsize=9.0, pad=7)
    ax1.set_xlabel("Hop count")
    ax1.set_ylabel("End-to-end latency (s)")
    ax1.set_xticks(hops)
    ax1.set_xlim(0.75, 7.25)
    ax1.set_ylim(0, 3.35)
    ax1.legend(loc="upper left", frameon=True, framealpha=0.94, edgecolor=GRID, fontsize=7.5, borderpad=0.32, labelspacing=0.24)

    # Panel (b)
    style_axes(ax2)
    ax2.errorbar(
        drains,
        d_med,
        yerr=[d_med - d_p25, d_p75 - d_med],
        fmt="s",
        color=BLUE,
        markersize=5.0,
        capsize=3.0,
        elinewidth=1.3,
        label="Measured median & IQR",
        zorder=4,
    )
    dx = np.linspace(200, 2050, 50)
    ax2.plot(
        dx,
        reg["slope"] * dx + reg["intercept"],
        color=BLUE,
        linewidth=1.55,
        label=f"Fit: {reg['slope']:.3f}·d {reg['intercept']:+.1f} (R²={reg['r2']:.4f})",
        zorder=3,
    )
    ax2.plot(
        dx,
        0.5 * dx,
        color=TEAL,
        linestyle="--",
        linewidth=1.25,
        label="Ideal queue (drain / 2)",
        zorder=2,
    )
    ax2.set_title("(b) Drain-Interval Sweep (Hop 3/3, N = 50)", fontweight="bold", fontsize=9.0, pad=7)
    ax2.set_xlabel("Outbox drain interval (ms)")
    ax2.set_ylabel("Per-hop latency (ms)")
    ax2.set_xticks(drains)
    ax2.set_xticklabels(["250", "500", "1000", "2000"])
    ax2.set_xlim(100, 2150)
    ax2.set_ylim(0, 2280)
    ax2.legend(loc="upper left", frameon=True, framealpha=0.94, edgecolor=GRID, fontsize=7.3, borderpad=0.32, labelspacing=0.24)

    save_matplotlib_bundle(fig, "fig4-hop-and-drain-scaling")


def build_fig5_route_cut_and_netem(d03: dict, d04: dict) -> None:
    """Fig 5: Route-cut latency distributions (N=20) & tc netem impairment matrix (N=10)."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.1, 2.85), gridspec_kw={"width_ratios": [1.0, 1.08], "wspace": 0.56})

    # Panel (a): Route cut intact vs bridged cut
    style_axes(ax1)
    ax1.grid(False, axis="x")
    metrics = [
        ("certificateMs", "Cert."),
        ("communityMs", "Comm."),
        ("postMs", "Post"),
        ("chainSpanMs", "Chain\nspan"),
    ]
    x = np.arange(len(metrics))
    offset = 0.16
    for regime_key, label, col, off, marker in [
        ("intact", "IX intact (20/20)", BLUE, -offset, "o"),
        ("bridgedCut", "IX cut, bridged (20/20)", AMBER, offset, "s"),
    ]:
        s = d03[regime_key]["summary"]
        med_ms = [s[k]["median"] for k, _ in metrics]
        med = np.array([m / 1000.0 for m in med_ms])
        p25 = np.array([s[k]["p25"] / 1000.0 for k, _ in metrics])
        p75 = np.array([s[k]["p75"] / 1000.0 for k, _ in metrics])
        p95 = np.array([s[k]["p95"] / 1000.0 for k, _ in metrics])
        mn = np.array([s[k]["min"] / 1000.0 for k, _ in metrics])
        xp = x + off
        ax1.vlines(xp, mn, p95, color=col, linewidth=1.1, alpha=0.75, zorder=2)
        ax1.vlines(xp, p25, p75, color=col, linewidth=5.2, alpha=0.88, zorder=3)
        ax1.scatter(xp, med, color="#FFFFFF", edgecolor=col, linewidth=1.6, marker=marker, s=34, zorder=4, label=label)
        for idx_m, (xi, yi_ms) in enumerate(zip(xp, med_ms)):
            ax1.text(xi, p95[idx_m] + 0.08, fmt_sec(yi_ms), ha="center", va="bottom", fontsize=7.1, color=col, fontweight="bold")

    ax1.set_title("(a) Route-Cut Latency (N = 20)", fontweight="bold", fontsize=9.0, pad=7)
    ax1.set_xticks(x)
    ax1.set_xticklabels([lbl for _, lbl in metrics])
    ax1.set_ylabel("Crossing latency (s)")
    ax1.set_ylim(0, 2.95)
    ax1.legend(loc="upper left", frameon=True, framealpha=0.94, edgecolor=GRID, fontsize=7.4, borderpad=0.30, labelspacing=0.22)

    # Panel (b): tc netem horizontal log scale
    style_axes(ax2)
    ax2.grid(False, axis="y")
    order = [
        ("baseline_clean", "Clean baseline"),
        ("high_rtt_jitter", "RTT 150±50 ms"),
        ("loss_5pct", "5% loss + 50 ms"),
        ("loss_10pct", "10% loss + 75 ms"),
        ("bw_128kbps", "128 kbps + 2%"),
        ("intermittent_flap", "Flap 3×(8s/8s)"),
    ]
    y_pos = np.arange(len(order))[::-1]
    sc = d04["scenarios"]
    for idx, (k, lbl) in enumerate(order):
        yp = y_pos[idx]
        st = sc[k]["summary"]
        med_ms = st["median"]
        med = med_ms / 1000.0
        p25 = st["p25"] / 1000.0
        p75 = st["p75"] / 1000.0
        mn = st["min"] / 1000.0
        p95 = st["p95"] / 1000.0
        col = RED if k == "intermittent_flap" else BLUE
        ax2.hlines(yp, mn, p95, color=col, linewidth=1.2, alpha=0.75, zorder=2)
        ax2.hlines(yp, p25, p75, color=col, linewidth=5.0, alpha=0.88, zorder=3)
        ax2.scatter([med], [yp], color="#FFFFFF", edgecolor=col, linewidth=1.6, s=36, zorder=4)
        ax2.text(
            p95 * 1.14,
            yp,
            f"{fmt_sec(med_ms)} s ({st['delivered']}/{st['attempted']})",
            va="center",
            ha="left",
            fontsize=7.4,
            color=col,
            fontweight="bold",
        )

    ax2.set_xscale("log")
    ax2.set_xlim(0.55, 85.0)
    ax2.xaxis.set_major_formatter(mticker.FuncFormatter(lambda v, _: f"{v:g}"))
    ax2.set_xticks([0.5, 1, 2, 5, 10, 20, 40])
    ax2.set_yticks(y_pos)
    ax2.set_yticklabels([lbl for _, lbl in order])
    ax2.set_ylim(-0.6, len(order) - 0.35)
    ax2.set_title("(b) Controlled tc netem (port 8444, N = 10)", fontweight="bold", fontsize=9.0, pad=7)
    ax2.set_xlabel("Delivery latency (s, log; IQR & min–p95)")

    save_matplotlib_bundle(fig, "fig5-route-cut-and-netem")


def build_fig6_stress_and_scalability(d05: dict) -> None:
    """Fig 6: Adversarial rejection throughput (0 writes) & concurrent valid-write scaling."""
    reg = d05["regimes"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.1, 2.85), gridspec_kw={"width_ratios": [1.05, 1.0], "wspace": 0.45})

    # Panel (a): Adversarial rejection regimes
    style_axes(ax1)
    ax1.grid(False, axis="y")
    adv_items = [
        ("5c Malformed protobuf\n(3,000 × 400)", reg["malformedProtobufFlood"]["http"], TEAL),
        ("5a HTTP default limiter\n(2,709 × 429 + 204 × 403)", reg["invalidSigDefaultLimiter"]["http"], BLUE),
        ("5b Invalid-sig saturation\n(2,593 × 403, no limit)", reg["invalidSigPipelineSaturation"]["http"], AMBER),
        ("5d-1 Exact duplicate\n(1,000 × 200 dedupe)", reg["exactDuplicateFlood"]["http"], MUTED),
        ("5d-2 Nonce replay\n(1,000 × 409 REPLAY)", reg["nonceReplayFlood"]["http"], RED),
    ]
    y_pos = np.arange(len(adv_items))[::-1]
    rps_vals = [item[1]["rps"] for item in adv_items]
    p50_vals = [item[1]["latencyMs"]["median"] for item in adv_items]
    cols = [item[2] for item in adv_items]

    ax1.barh(y_pos, rps_vals, height=0.56, color=cols, alpha=0.88, edgecolor=INK, linewidth=0.5, zorder=3)
    for yp, rps, p50 in zip(y_pos, rps_vals, p50_vals):
        ax1.text(rps + 45, yp, f"{rps:,} req/s (p50 {p50:.1f} ms)", va="center", ha="left", fontsize=7.3, fontweight="bold")

    ax1.set_yticks(y_pos)
    ax1.set_yticklabels([item[0] for item in adv_items], fontsize=7.7)
    ax1.set_xlim(0, 3650)
    ax1.set_xlabel("Throughput (req/s)")
    ax1.set_title("(a) Adversarial & Replay Load (c = 16, 0 writes)", fontweight="bold", fontsize=9.0, pad=7)

    # Panel (b): Concurrent valid writes c = 1, 4, 16, 32
    style_axes(ax2)
    ax2.grid(False, axis="x")
    c_keys = ["c_1", "c_4", "c_16", "c_32"]
    c_labels = ["c = 1", "c = 4", "c = 16", "c = 32"]
    x = np.arange(len(c_keys))
    cw = reg["concurrentValidWrites"]
    tputs = [cw[k]["http"]["rps"] for k in c_keys]
    p50s = [cw[k]["http"]["latencyMs"]["median"] for k in c_keys]
    p95s = [cw[k]["http"]["latencyMs"]["p95"] for k in c_keys]
    mems = [cw[k]["resources"]["jb-stress-node"]["memMiB"] for k in c_keys]

    bars = ax2.bar(x - 0.16, tputs, width=0.32, color=BLUE, alpha=0.86, edgecolor=INK, linewidth=0.5, label="Throughput (node MiB)", zorder=3)
    for b, tp, mem in zip(bars, tputs, mems):
        ax2.text(
            b.get_x() + b.get_width() / 2.0,
            tp + 0.9,
            f"{tp}\n({mem:.0f}M)",
            ha="center",
            va="bottom",
            fontsize=7.0,
            color=BLUE,
            fontweight="bold",
        )

    ax2.set_xticks(x)
    ax2.set_xticklabels(c_labels)
    ax2.set_ylim(0, 47)
    ax2.set_ylabel("Throughput (req/s)", color=BLUE)
    ax2.tick_params(axis="y", colors=BLUE)
    ax2.set_xlabel("Concurrent signing clients (200 posts each)")

    ax2r = ax2.twinx()
    ax2r.spines["top"].set_visible(False)
    ax2r.spines["right"].set_color(AMBER)
    l1 = ax2r.plot(x + 0.14, p50s, color=AMBER, marker="o", markersize=4.5, linewidth=1.6, label="Median latency", zorder=4)
    l2 = ax2r.plot(x + 0.14, p95s, color=RED, linestyle="--", marker="^", markersize=4.5, linewidth=1.45, label="p95 latency", zorder=4)
    ax2r.set_yscale("log")
    ax2r.set_ylim(15, 45000)
    ax2r.set_ylabel("Latency (ms, log)", color=AMBER)
    ax2r.tick_params(axis="y", colors=AMBER)

    handles = [bars, l1[0], l2[0]]
    labels = ["Throughput (node MiB)", "Median latency", "p95 latency"]
    ax2.legend(handles, labels, loc="upper left", frameon=True, framealpha=0.95, edgecolor=GRID, fontsize=7.2, borderpad=0.3, labelspacing=0.22)
    ax2.set_title("(b) Concurrent Valid Writes (100% projected)", fontweight="bold", fontsize=9.0, pad=7)

    save_matplotlib_bundle(fig, "fig6-stress-and-scalability")


def build_fig7_ap_and_cgnat_comparison(d07: dict) -> None:
    """Fig 7: Wire size comparison & CGNAT asymmetric reachability vs ActivityPub."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.1, 2.85), gridspec_kw={"width_ratios": [1.15, 1.0], "wspace": 0.38})

    # Panel (a): Byte overhead / representation comparison (live Mastodon n=40 vs JB canonical)
    style_axes(ax1)
    ax1.grid(False, axis="y")
    size_items = [
        ("Mastodon AP raw\n(overhead p50, n=40)", 3627, RED),
        ("Mastodon AP gzip\n(full w/ text p50, n=40)", 1063, AMBER),
        ("JB forum post\n(non-text, 220 B total)", 206, BLUE),
        ("JB Bangla broadcast\n(non-text, 243 B total)", 177, BLUE),
        ("JB check-in\n(total = overhead, 64B sig)", 155, TEAL),
    ]
    y_pos = np.arange(len(size_items))[::-1]
    vals = [v for _, v, _ in size_items]
    cols = [c for _, _, c in size_items]
    ax1.barh(y_pos, vals, height=0.56, color=cols, alpha=0.88, edgecolor=INK, linewidth=0.5, zorder=3)
    for yp, v in zip(y_pos, vals):
        ax1.text(v + 85, yp, f"{v:,} B", va="center", ha="left", fontsize=7.6, fontweight="bold")

    c7a = d07["constrainedLossy128kbps5PctLoss150msRtt"]
    jb_med = c7a["jagooBahee"]["latencyMs"]["median"]
    ap_med = c7a["activityPubBaseline"]["latencyMs"]["median"]
    ax1.text(
        0.98,
        0.08,
        f"128 kbps · 5% loss · 150 ms RTT (N=20):\nJB 20/20 ({jb_med:.1f} ms, {c7a['jagooBahee']['txBytesPerPost']:.1f} B/post)\n"
        f"Minimal AP 20/20 ({ap_med:.1f} ms, {c7a['activityPubBaseline']['txBytesPerPost']:.1f} B/post)",
        transform=ax1.transAxes,
        ha="right",
        va="bottom",
        fontsize=6.9,
        bbox={"boxstyle": "round,pad=0.35", "facecolor": GRAY, "edgecolor": BORDER, "linewidth": 0.8},
    )
    ax1.set_yticks(y_pos)
    ax1.set_yticklabels([lbl for lbl, _, _ in size_items], fontsize=7.6)
    ax1.set_xlim(0, 4750)
    ax1.set_xlabel("Bytes (AP full/gzip vs. JB canonical)")
    ax1.set_title("(a) Encoding Size & Lossy-Link E2E (7a)", fontweight="bold", fontsize=9.0, pad=7)

    # Panel (b): CGNAT asymmetric reachability (7b-1 & 7b-2)
    style_axes(ax2)
    ax2.grid(False, axis="x")
    c7b = d07["asymmetricCgnatReachability"]
    jb_ss = c7b["steadyStateBlockedInbound"]["jagooBaheeSteadyStatePull"]
    ap_ss = c7b["steadyStateBlockedInbound"]["activityPubInboundPush"]
    nat_pull = c7b["outboundOnlyCgnatNode"]["inboundPullViaBackfillFromStartMs"]
    nat_push = c7b["outboundOnlyCgnatNode"]["outboundPushViaDeliverMs"]

    cats = [
        ("JB steady\npull\n(7b-1)", jb_ss["deliveryRate"] * 100.0, f"{jb_ss['delivered']}/{jb_ss['attempted']}\n({fmt_sec(jb_ss['median'])} s)", BLUE),
        ("AP HTTP\npush\n(7b-1)", ap_ss["deliveryRate"] * 100.0, f"{ap_ss['delivered']}/{ap_ss['attempted']}\n(blocked)", RED),
        ("JB NAT\nBackfill\n(7b-2)", nat_pull["deliveryRate"] * 100.0, f"{nat_pull['delivered']}/{nat_pull['attempted']}\n({fmt_sec(nat_pull['median'])} s)", TEAL),
        ("JB NAT\nDeliver\n(7b-2)", nat_push["deliveryRate"] * 100.0, f"{nat_push['delivered']}/{nat_push['attempted']}\n({fmt_sec(nat_push['median'])} s)", BLUE),
    ]
    x = np.arange(len(cats))
    rates = [c[1] for c in cats]
    bcols = [c[3] for c in cats]
    ax2.bar(x, rates, width=0.50, color=bcols, alpha=0.88, edgecolor=INK, linewidth=0.5, zorder=3)
    for xi, rate, ann, col in zip(x, rates, [c[2] for c in cats], bcols):
        ax2.text(xi, rate + 3.0, ann, ha="center", va="bottom", fontsize=7.3, fontweight="bold", color=col)

    ax2.axvline(1.5, color=BORDER, linestyle="--", linewidth=0.9)
    ax2.set_xticks(x)
    ax2.set_xticklabels([c[0] for c in cats], fontsize=7.6)
    ax2.set_ylim(0, 128)
    ax2.set_yticks([0, 25, 50, 75, 100])
    ax2.set_ylabel("Delivery success rate (%)")
    ax2.set_title("(b) CGNAT Blocked-Inbound Test (N = 10)", fontweight="bold", fontsize=9.0, pad=7)

    save_matplotlib_bundle(fig, "fig7-ap-and-cgnat-comparison")


def main() -> None:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    d03 = load_json("03-route-cut-trials.json")
    d04 = load_json("04-netem-emulation.json")
    d05 = load_json("05-stress-and-valid-load.json")
    d06 = load_json("06-clean-sweep.json")
    d07 = load_json("07-ap-e2e-comparison.json")

    build_fig1_system_architecture()
    build_fig2_admission_pipeline()
    build_fig3_route_cut_topology(d03)
    build_fig4_hop_and_drain_scaling(d06)
    build_fig5_route_cut_and_netem(d03, d04)
    build_fig6_stress_and_scalability(d05)
    build_fig7_ap_and_cgnat_comparison(d07)
    print(f"Generated 7 figures (.pdf/.svg/.png) in {FIG_DIR}")


if __name__ == "__main__":
    main()
