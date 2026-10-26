from __future__ import annotations

import html
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


WIDTH = 2400
HEIGHT = 1500
SCALE = 1
INK = "#111111"
SOFT = "#f7f7f7"
WHITE = "#ffffff"
FONT_PATHS = (
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path(r"C:\Windows\Fonts\segoeui.ttf"),
)


@dataclass(frozen=True)
class UseCase:
    key: str
    cx: int
    cy: int
    w: int
    h: int
    lines: tuple[str, ...]
    hub: bool = False

    @property
    def box(self) -> tuple[int, int, int, int]:
        return (
            self.cx - self.w // 2,
            self.cy - self.h // 2,
            self.cx + self.w // 2,
            self.cy + self.h // 2,
        )


@dataclass(frozen=True)
class Diagram:
    slug: str
    title: str
    actor: tuple[str, ...]
    cases: tuple[UseCase, ...]
    actor_links: tuple[str, ...]
    extensions: tuple[tuple[str, str, str], ...]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if bold:
        candidates.extend((Path(r"C:\Windows\Fonts\arialbd.ttf"), Path(r"C:\Windows\Fonts\segoeuib.ttf")))
    candidates.extend(FONT_PATHS)
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


FONT_TITLE = font(31, bold=True)
FONT_CASE = font(25)
FONT_HUB = font(25, bold=True)
FONT_LABEL = font(21)
FONT_ACTOR = font(27, bold=True)
FONT_FOOTER = font(19)


def ellipse_boundary(case: UseCase, toward_x: float, toward_y: float) -> tuple[float, float]:
    dx = toward_x - case.cx
    dy = toward_y - case.cy
    if dx == 0 and dy == 0:
        return float(case.cx), float(case.cy)
    a = case.w / 2
    b = case.h / 2
    scale = 1 / math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b))
    return case.cx + dx * scale, case.cy + dy * scale


def dashed_segments(start: tuple[float, float], end: tuple[float, float], dash: float = 13, gap: float = 9):
    x1, y1 = start
    x2, y2 = end
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    pos = 0.0
    while pos < length:
        seg_end = min(pos + dash, length)
        yield (x1 + ux * pos, y1 + uy * pos, x1 + ux * seg_end, y1 + uy * seg_end)
        pos += dash + gap


def arrow_points(end: tuple[float, float], start: tuple[float, float], size: float = 18):
    ex, ey = end
    sx, sy = start
    angle = math.atan2(ey - sy, ex - sx)
    left = (ex - size * math.cos(angle - math.pi / 6), ey - size * math.sin(angle - math.pi / 6))
    right = (ex - size * math.cos(angle + math.pi / 6), ey - size * math.sin(angle + math.pi / 6))
    return left, right


def relation_label_position(start: tuple[float, float], end: tuple[float, float]) -> tuple[int, int]:
    x = int(start[0] * 0.46 + end[0] * 0.54)
    y = int(start[1] * 0.46 + end[1] * 0.54) - 22
    return x, y


def draw_centered_lines(draw: ImageDraw.ImageDraw, case: UseCase):
    use_font = FONT_HUB if case.hub else FONT_CASE
    spacing = 3
    heights = []
    for line in case.lines:
        box = draw.textbbox((0, 0), line, font=use_font)
        heights.append(box[3] - box[1])
    total = sum(heights) + spacing * (len(case.lines) - 1)
    y = case.cy - total / 2
    for line, line_height in zip(case.lines, heights):
        box = draw.textbbox((0, 0), line, font=use_font)
        text_w = box[2] - box[0]
        draw.text((case.cx - text_w / 2, y), line, fill=INK, font=use_font)
        y += line_height + spacing


def svg_text_lines(case: UseCase) -> str:
    line_height = 30
    start_y = case.cy - (len(case.lines) - 1) * line_height / 2 + 9
    weight = "700" if case.hub else "400"
    chunks = []
    for idx, line in enumerate(case.lines):
        chunks.append(
            f'<text x="{case.cx}" y="{start_y + idx * line_height:.1f}" '
            f'text-anchor="middle" font-family="Arial, sans-serif" font-size="25" '
            f'font-weight="{weight}" fill="{INK}">{html.escape(line)}</text>'
        )
    return "\n".join(chunks)


def make_diagram(diagram: Diagram, output_dir: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)
    cases = {case.key: case for case in diagram.cases}
    svg: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<defs><marker id="openArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M 10 1 L 1 6 L 10 11" fill="none" stroke="#111111" stroke-width="1.5"/></marker></defs>',
    ]

    # System boundary and headings.
    boundary = (310, 55, 2350, 1425)
    draw.rectangle(boundary, outline=INK, width=3)
    draw.text((1330, 78), "Sistema de Evaluación de Transparencia Institucional", fill=INK, font=FONT_TITLE, anchor="ma")
    draw.text((1330, 118), diagram.title, fill=INK, font=FONT_FOOTER, anchor="ma")
    svg.extend(
        (
            f'<rect x="310" y="55" width="2040" height="1370" fill="none" stroke="{INK}" stroke-width="3"/>',
            f'<text x="1330" y="91" text-anchor="middle" font-family="Arial, sans-serif" font-size="31" font-weight="700" fill="{INK}">Sistema de Evaluación de Transparencia Institucional</text>',
            f'<text x="1330" y="124" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" fill="{INK}">{html.escape(diagram.title)}</text>',
        )
    )

    # Actor.
    ax, head_y, radius = 155, 685, 27
    body_top = head_y + radius
    body_bottom = body_top + 105
    draw.ellipse((ax - radius, head_y - radius, ax + radius, head_y + radius), outline=INK, width=4)
    draw.line((ax, body_top, ax, body_bottom), fill=INK, width=4)
    draw.line((ax - 62, body_top + 35, ax + 62, body_top + 35), fill=INK, width=4)
    draw.line((ax, body_bottom, ax - 58, body_bottom + 78), fill=INK, width=4)
    draw.line((ax, body_bottom, ax + 58, body_bottom + 78), fill=INK, width=4)
    label_y = body_bottom + 98
    for idx, line in enumerate(diagram.actor):
        draw.text((ax, label_y + idx * 31), line, fill=INK, font=FONT_ACTOR, anchor="ma")
    actor_svg_label = "".join(
        f'<text x="{ax}" y="{label_y + idx * 31 + 23}" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="{INK}">{html.escape(line)}</text>'
        for idx, line in enumerate(diagram.actor)
    )
    svg.append(
        f'<circle cx="{ax}" cy="{head_y}" r="{radius}" fill="none" stroke="{INK}" stroke-width="4"/>'
        f'<line x1="{ax}" y1="{body_top}" x2="{ax}" y2="{body_bottom}" stroke="{INK}" stroke-width="4"/>'
        f'<line x1="{ax - 62}" y1="{body_top + 35}" x2="{ax + 62}" y2="{body_top + 35}" stroke="{INK}" stroke-width="4"/>'
        f'<line x1="{ax}" y1="{body_bottom}" x2="{ax - 58}" y2="{body_bottom + 78}" stroke="{INK}" stroke-width="4"/>'
        f'<line x1="{ax}" y1="{body_bottom}" x2="{ax + 58}" y2="{body_bottom + 78}" stroke="{INK}" stroke-width="4"/>'
        + actor_svg_label
    )

    # Solid actor associations are drawn before use cases so their ends stay clean.
    actor_anchor = (ax + 62, body_top + 35)
    for key in diagram.actor_links:
        target = cases[key]
        end = ellipse_boundary(target, *actor_anchor)
        draw.line((*actor_anchor, *end), fill=INK, width=3)
        svg.append(
            f'<line x1="{actor_anchor[0]}" y1="{actor_anchor[1]}" x2="{end[0]:.1f}" y2="{end[1]:.1f}" stroke="{INK}" stroke-width="3"/>'
        )

    # Dashed extend/include relations.
    for source_key, target_key, stereotype in diagram.extensions:
        source = cases[source_key]
        target = cases[target_key]
        start = ellipse_boundary(source, target.cx, target.cy)
        end = ellipse_boundary(target, source.cx, source.cy)
        for segment in dashed_segments(start, end):
            draw.line(segment, fill=INK, width=3)
        left, right = arrow_points(end, start)
        draw.line((*left, *end), fill=INK, width=3)
        draw.line((*right, *end), fill=INK, width=3)
        lx, ly = relation_label_position(start, end)
        label = f"<<{stereotype}>>"
        label_box = draw.textbbox((0, 0), label, font=FONT_LABEL)
        label_w = label_box[2] - label_box[0]
        label_h = label_box[3] - label_box[1]
        draw.rectangle((lx - label_w / 2 - 5, ly - 2, lx + label_w / 2 + 5, ly + label_h + 3), fill=WHITE)
        draw.text((lx, ly), label, fill=INK, font=FONT_LABEL, anchor="ma")
        svg.append(
            f'<line x1="{start[0]:.1f}" y1="{start[1]:.1f}" x2="{end[0]:.1f}" y2="{end[1]:.1f}" stroke="{INK}" stroke-width="3" stroke-dasharray="13 9" marker-end="url(#openArrow)"/>'
            f'<rect x="{lx - 68}" y="{ly - 19}" width="136" height="29" fill="#ffffff"/>'
            f'<text x="{lx}" y="{ly + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="21" fill="{INK}">{html.escape(label)}</text>'
        )

    # Use cases.
    for case in diagram.cases:
        draw.ellipse(case.box, fill=SOFT if case.hub else WHITE, outline=INK, width=3)
        draw_centered_lines(draw, case)
        fill = SOFT if case.hub else WHITE
        svg.append(
            f'<ellipse cx="{case.cx}" cy="{case.cy}" rx="{case.w / 2:.1f}" ry="{case.h / 2:.1f}" fill="{fill}" stroke="{INK}" stroke-width="3"/>'
        )
        svg.append(svg_text_lines(case))

    footer = "Notación UML: asociación (línea continua) · extensión (línea discontinua)"
    draw.text((1330, 1460), footer, fill="#444444", font=FONT_FOOTER, anchor="ma")
    svg.append(
        f'<text x="1330" y="1468" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" fill="#444444">{html.escape(footer)}</text>'
    )
    svg.append("</svg>")

    png_path = output_dir / f"{diagram.slug}.png"
    svg_path = output_dir / f"{diagram.slug}.svg"
    image.save(png_path, dpi=(180, 180), optimize=True)
    svg_path.write_text("\n".join(svg), encoding="utf-8")


def uc(key: str, cx: int, cy: int, lines: Iterable[str], *, w: int = 390, h: int = 84, hub: bool = False) -> UseCase:
    return UseCase(key, cx, cy, w, h, tuple(lines), hub)


DIAGRAMS = (
    Diagram(
        slug="01_administrador_sistema",
        title="Diagrama de casos de uso — Administrador del Sistema",
        actor=("Administrador", "del Sistema"),
        cases=(
            uc("login", 600, 215, ("Iniciar sesión",), w=350, hub=True),
            uc("users", 600, 495, ("Gestionar usuarios", "y permisos"), w=400, h=98, hub=True),
            uc("config", 600, 805, ("Configurar evaluación", "institucional"), w=400, h=98, hub=True),
            uc("supervise", 600, 1165, ("Supervisar transparencia", "institucional"), w=430, h=98, hub=True),
            uc("reset", 1120, 175, ("Restablecer contraseña",), w=380),
            uc("twofa", 1660, 175, ("Verificar acceso 2FA",), w=340),
            uc("finduser", 1080, 385, ("Buscar usuarios",), w=330),
            uc("edituser", 1600, 385, ("Crear o editar usuario",), w=380),
            uc("statususer", 1080, 500, ("Activar o inactivar", "usuario"), w=360),
            uc("role", 1600, 500, ("Asignar rol",), w=310),
            uc("audit", 1340, 620, ("Consultar auditoría", "del sistema"), w=370),
            uc("university", 1050, 745, ("Gestionar universidades",), w=390),
            uc("indicator", 1600, 745, ("Gestionar categorías", "e indicadores"), w=390),
            uc("weight", 1340, 875, ("Definir ponderaciones",), w=360),
            uc("documents", 1000, 1050, ("Gestionar documentos",), w=370),
            uc("evaluate", 1500, 1035, ("Ejecutar evaluación", "LOTAIP"), w=380),
            uc("review", 1990, 1050, ("Revisar evidencias", "y observaciones"), w=380),
            uc("results", 1000, 1190, ("Consultar dashboard", "y rankings"), w=370),
            uc("reports", 1500, 1190, ("Generar reportes",), w=340),
            uc("feedback", 1990, 1190, ("Atender comentarios", "de usuarios"), w=360),
            uc("index", 1500, 1320, ("Calcular índice", "de transparencia"), w=360),
        ),
        actor_links=("login", "users", "config", "supervise"),
        extensions=(
            ("reset", "login", "extend"),
            ("twofa", "login", "extend"),
            ("finduser", "users", "extend"),
            ("edituser", "users", "extend"),
            ("statususer", "users", "extend"),
            ("role", "users", "extend"),
            ("audit", "users", "extend"),
            ("university", "config", "extend"),
            ("indicator", "config", "extend"),
            ("weight", "config", "extend"),
            ("documents", "supervise", "extend"),
            ("evaluate", "supervise", "extend"),
            ("review", "supervise", "extend"),
            ("results", "supervise", "extend"),
            ("reports", "supervise", "extend"),
            ("feedback", "supervise", "extend"),
            ("index", "supervise", "extend"),
        ),
    ),
    Diagram(
        slug="02_administrador_universitario",
        title="Diagrama de casos de uso — Administrador Universitario",
        actor=("Administrador", "Universitario"),
        cases=(
            uc("login", 600, 215, ("Iniciar sesión",), w=350, hub=True),
            uc("institution", 600, 505, ("Gestionar información", "institucional"), w=420, h=98, hub=True),
            uc("evidence", 600, 825, ("Gestionar evidencias", "de transparencia"), w=420, h=98, hub=True),
            uc("results", 600, 1175, ("Consultar evaluación", "y resultados"), w=420, h=98, hub=True),
            uc("reset", 1120, 175, ("Restablecer contraseña",), w=380),
            uc("twofa", 1660, 175, ("Verificar acceso 2FA",), w=340),
            uc("university", 1080, 440, ("Consultar universidad",), w=350),
            uc("update", 1590, 440, ("Actualizar datos", "institucionales"), w=350),
            uc("period", 1340, 565, ("Seleccionar período", "de evaluación"), w=370),
            uc("upload", 1030, 745, ("Cargar documento", "o enlace"), w=350),
            uc("classify", 1510, 730, ("Clasificar evidencia", "por literal LOTAIP"), w=380),
            uc("replace", 1990, 745, ("Reemplazar o eliminar", "evidencia"), w=390),
            uc("download", 1030, 880, ("Consultar o descargar", "documento"), w=370),
            uc("validate", 1510, 880, ("Ejecutar validación", "automática"), w=370),
            uc("status", 1990, 880, ("Consultar estado", "de cumplimiento"), w=350),
            uc("dashboard", 1000, 1090, ("Visualizar dashboard",), w=350),
            uc("index", 1480, 1080, ("Consultar índice", "de transparencia"), w=350),
            uc("compare", 1970, 1090, ("Comparar universidades",), w=370),
            uc("ranking", 1000, 1225, ("Consultar rankings",), w=330),
            uc("reports", 1480, 1225, ("Generar reportes",), w=330),
            uc("comments", 1970, 1225, ("Enviar comentarios", "y feedback"), w=350),
            uc("observations", 1480, 1350, ("Consultar observaciones",), w=370),
        ),
        actor_links=("login", "institution", "evidence", "results"),
        extensions=(
            ("reset", "login", "extend"),
            ("twofa", "login", "extend"),
            ("university", "institution", "extend"),
            ("update", "institution", "extend"),
            ("period", "institution", "extend"),
            ("upload", "evidence", "extend"),
            ("classify", "evidence", "extend"),
            ("replace", "evidence", "extend"),
            ("download", "evidence", "extend"),
            ("validate", "evidence", "extend"),
            ("status", "evidence", "extend"),
            ("dashboard", "results", "extend"),
            ("index", "results", "extend"),
            ("compare", "results", "extend"),
            ("ranking", "results", "extend"),
            ("reports", "results", "extend"),
            ("comments", "results", "extend"),
            ("observations", "results", "extend"),
        ),
    ),
    Diagram(
        slug="03_auditor",
        title="Diagrama de casos de uso — Auditor",
        actor=("Auditor",),
        cases=(
            uc("access", 600, 235, ("Acceder al sistema",), w=370, hub=True),
            uc("compliance", 600, 600, ("Consultar cumplimiento", "documental"), w=420, h=98, hub=True),
            uc("audit", 600, 930, ("Auditar evaluación", "LOTAIP"), w=400, h=98, hub=True),
            uc("results", 600, 1240, ("Analizar resultados", "institucionales"), w=410, h=98, hub=True),
            uc("register", 1080, 175, ("Registrarse como auditor",), w=390),
            uc("login", 1560, 175, ("Iniciar sesión",), w=330),
            uc("reset", 2040, 175, ("Restablecer contraseña",), w=380),
            uc("twofa", 1560, 300, ("Verificar acceso 2FA",), w=340),
            uc("list", 1030, 525, ("Consultar lista", "de cumplimiento"), w=350),
            uc("filter", 1510, 510, ("Filtrar por universidad,", "período o literal"), w=400),
            uc("view", 1990, 525, ("Visualizar o descargar", "evidencias"), w=390),
            uc("status", 1510, 655, ("Consultar estado", "de validación"), w=350),
            uc("detail", 1030, 850, ("Revisar criterios", "y resultados"), w=350),
            uc("observe", 1510, 840, ("Registrar observaciones", "por criterio"), w=380),
            uc("approve", 1990, 850, ("Confirmar o ajustar", "la revisión"), w=370),
            uc("trace", 1510, 995, ("Consultar trazabilidad", "de la evaluación"), w=380),
            uc("dashboard", 1010, 1170, ("Visualizar dashboard",), w=350),
            uc("index", 1480, 1155, ("Consultar índice", "de transparencia"), w=350),
            uc("compare", 1970, 1170, ("Comparar universidades",), w=370),
            uc("ranking", 1010, 1310, ("Consultar rankings",), w=330),
            uc("reports", 1480, 1310, ("Generar reportes",), w=330),
        ),
        actor_links=("access", "compliance", "audit", "results"),
        extensions=(
            ("register", "access", "extend"),
            ("login", "access", "extend"),
            ("reset", "access", "extend"),
            ("twofa", "access", "extend"),
            ("list", "compliance", "extend"),
            ("filter", "compliance", "extend"),
            ("view", "compliance", "extend"),
            ("status", "compliance", "extend"),
            ("detail", "audit", "extend"),
            ("observe", "audit", "extend"),
            ("approve", "audit", "extend"),
            ("trace", "audit", "extend"),
            ("dashboard", "results", "extend"),
            ("index", "results", "extend"),
            ("compare", "results", "extend"),
            ("ranking", "results", "extend"),
            ("reports", "results", "extend"),
        ),
    ),
)


def main() -> None:
    output_dir = Path(__file__).resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)
    for diagram in DIAGRAMS:
        make_diagram(diagram, output_dir)
        print(f"Generado: {diagram.slug}.png / {diagram.slug}.svg")


if __name__ == "__main__":
    main()
