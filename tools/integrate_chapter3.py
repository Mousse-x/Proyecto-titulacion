from __future__ import annotations

import re
from copy import deepcopy
from io import BytesIO
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.text.paragraph import Paragraph


SOURCE = Path(r"C:\Users\Usuario\Downloads\Capitulo_III_SisTransp_usabilidad.docx")
THESIS = Path(
    r"C:\Users\Usuario\Downloads\tesis_SisTransp_capitulo_III_reestructurado_usabilidad.docx"
)
OUTPUT = Path(
    r"C:\U\Tesis\tesis-transparencia\tesis_SisTransp_capitulo_III_integrado.docx"
)

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def paragraph_for(element, document):
    return Paragraph(element, document._body)


def paragraph_text(element, document):
    if element.tag != qn("w:p"):
        return ""
    return paragraph_for(element, document).text.strip()


def find_body_paragraph(document, predicate, start=0):
    for index, element in enumerate(document._element.body):
        if index < start or element.tag != qn("w:p"):
            continue
        paragraph = paragraph_for(element, document)
        if predicate(paragraph):
            return index
    raise ValueError("No se encontró el límite solicitado en el documento")


def replace_paragraph_text_preserving_first_run(element, text):
    text_nodes = element.xpath(".//w:t")
    if not text_nodes:
        run = OxmlElement("w:r")
        text_node = OxmlElement("w:t")
        text_node.text = text
        run.append(text_node)
        element.append(run)
        return
    text_nodes[0].text = text
    if text.startswith(" ") or text.endswith(" "):
        text_nodes[0].set(qn("xml:space"), "preserve")
    for text_node in text_nodes[1:]:
        text_node.text = ""


def copy_numbering_definitions(source_document, target_document, copied_elements):
    used_num_ids = set()
    for element in copied_elements:
        for num_id in element.xpath(".//w:numId"):
            value = num_id.get(qn("w:val"))
            if value and value != "0":
                used_num_ids.add(int(value))

    source_numbering = source_document.part.numbering_part.element
    target_numbering = target_document.part.numbering_part.element
    existing_abs_ids = [
        int(el.get(qn("w:abstractNumId")))
        for el in target_numbering.findall(qn("w:abstractNum"))
    ]
    existing_num_ids = [
        int(el.get(qn("w:numId"))) for el in target_numbering.findall(qn("w:num"))
    ]
    next_abs_id = max(existing_abs_ids, default=-1) + 1
    next_num_id = max(existing_num_ids, default=0) + 1
    mapping = {}

    first_num_position = next(
        (
            i
            for i, child in enumerate(target_numbering)
            if child.tag == qn("w:num")
        ),
        len(target_numbering),
    )

    for old_num_id in sorted(used_num_ids):
        source_num = next(
            (
                el
                for el in source_numbering.findall(qn("w:num"))
                if int(el.get(qn("w:numId"))) == old_num_id
            ),
            None,
        )
        if source_num is None:
            continue
        abstract_ref = source_num.find(qn("w:abstractNumId"))
        old_abs_id = int(abstract_ref.get(qn("w:val")))
        source_abstract = next(
            (
                el
                for el in source_numbering.findall(qn("w:abstractNum"))
                if int(el.get(qn("w:abstractNumId"))) == old_abs_id
            ),
            None,
        )
        if source_abstract is None:
            continue

        new_abstract = deepcopy(source_abstract)
        new_abstract.set(qn("w:abstractNumId"), str(next_abs_id))
        target_numbering.insert(first_num_position, new_abstract)
        first_num_position += 1

        new_num = deepcopy(source_num)
        new_num.set(qn("w:numId"), str(next_num_id))
        new_num.find(qn("w:abstractNumId")).set(qn("w:val"), str(next_abs_id))
        target_numbering.append(new_num)
        mapping[str(old_num_id)] = str(next_num_id)
        next_abs_id += 1
        next_num_id += 1

    for element in copied_elements:
        for num_id in element.xpath(".//w:numId"):
            old_value = num_id.get(qn("w:val"))
            if old_value in mapping:
                num_id.set(qn("w:val"), mapping[old_value])


def relationship_mapping(source_document, target_document, copied_elements):
    relationship_ids = set()
    relationship_attributes = {
        qn("r:id"),
        qn("r:embed"),
        qn("r:link"),
    }
    for element in copied_elements:
        for node in element.iter():
            for attribute_name, value in node.attrib.items():
                if attribute_name in relationship_attributes and value:
                    relationship_ids.add(value)

    mapping = {}
    for old_id in relationship_ids:
        relation = source_document.part.rels.get(old_id)
        if relation is None:
            continue
        if relation.is_external:
            mapping[old_id] = target_document.part.relate_to(
                relation.target_ref, relation.reltype, is_external=True
            )
        elif relation.reltype == RT.IMAGE:
            new_id, _ = target_document.part.get_or_add_image(
                BytesIO(relation.target_part.blob)
            )
            mapping[old_id] = new_id
        else:
            raise ValueError(
                f"Relación interna no compatible al fusionar el capítulo: {relation.reltype}"
            )

    for element in copied_elements:
        for node in element.iter():
            for attribute_name in relationship_attributes:
                old_value = node.get(attribute_name)
                if old_value in mapping:
                    node.set(attribute_name, mapping[old_value])


def map_styles(source_document, target_document, copied_elements):
    source_style_names = {
        style.style_id: style.name for style in source_document.styles
    }
    target_by_name = {
        style.name.casefold(): style.style_id for style in target_document.styles
    }
    for element in copied_elements:
        for style_node in element.xpath(".//w:pStyle | .//w:tblStyle"):
            source_id = style_node.get(qn("w:val"))
            source_name = source_style_names.get(source_id)
            if not source_name:
                continue
            target_id = target_by_name.get(source_name.casefold())
            if target_id:
                style_node.set(qn("w:val"), target_id)


def replace_heading_properties(element, template_ppr, level):
    ppr = element.find(qn("w:pPr"))
    if ppr is not None:
        element.remove(ppr)
    element.insert(0, deepcopy(template_ppr))
    current_text = "".join(node.text or "" for node in element.xpath(".//w:t"))
    clean_text = re.sub(r"^\s*\d+(?:\.\d+)+\s+", "", current_text, count=1)
    replace_paragraph_text_preserving_first_run(element, clean_text)


def scale_tables_and_images(elements, max_width_twips=8504):
    for element in elements:
        if element.tag == qn("w:tbl"):
            grid_columns = element.xpath("./w:tblGrid/w:gridCol")
            widths = [
                int(column.get(qn("w:w")))
                for column in grid_columns
                if column.get(qn("w:w"), "").isdigit()
            ]
            total_width = sum(widths)
            if total_width > max_width_twips and total_width:
                factor = max_width_twips / total_width
                for width_node in element.xpath(".//w:gridCol | .//w:tcW | .//w:tblW"):
                    width = width_node.get(qn("w:w"))
                    width_type = width_node.get(qn("w:type"))
                    if width and width.isdigit() and width_type in (None, "dxa"):
                        width_node.set(qn("w:w"), str(max(1, round(int(width) * factor))))

        for drawing in element.xpath(".//w:drawing"):
            extents = drawing.xpath(".//wp:extent")
            if not extents:
                continue
            width_emu = int(extents[0].get("cx"))
            max_width_emu = int(max_width_twips * 635)
            if width_emu <= max_width_emu:
                continue
            factor = max_width_emu / width_emu
            for extent in drawing.xpath(".//wp:extent | .//a:ext"):
                cx = extent.get("cx")
                cy = extent.get("cy")
                if cx and cy:
                    extent.set("cx", str(round(int(cx) * factor)))
                    extent.set("cy", str(round(int(cy) * factor)))


def create_text_paragraph(text, template_paragraph, run_template=None):
    paragraph = OxmlElement("w:p")
    template_ppr = template_paragraph.find(qn("w:pPr"))
    if template_ppr is not None:
        paragraph.append(deepcopy(template_ppr))
    run = OxmlElement("w:r")
    if run_template is not None:
        run_rpr = run_template.find(qn("w:rPr"))
        if run_rpr is not None:
            run.append(deepcopy(run_rpr))
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.append(text_node)
    paragraph.append(run)
    return paragraph


def normalized_reference_key(text):
    return re.sub(r"\W+", "", text.casefold())[:120]


def main():
    source = Document(str(SOURCE))
    thesis = Document(str(THESIS))
    thesis_body = thesis._element.body
    source_body = source._element.body

    chapter_start = find_body_paragraph(
        thesis, lambda p: p.text.strip().upper() == "CAPÍTULO III"
    )
    chapter_title = find_body_paragraph(
        thesis,
        lambda p: p.text.strip().upper() == "MARCO METODOLÓGICO",
        start=chapter_start + 1,
    )
    bibliography_start = find_body_paragraph(
        thesis,
        lambda p: p.text.strip().upper() == "BIBLIOGRAFÍA",
        start=chapter_title + 1,
    )

    heading_templates = {}
    for element in list(thesis_body)[chapter_title + 1 : bibliography_start]:
        if element.tag != qn("w:p"):
            continue
        paragraph = paragraph_for(element, thesis)
        match = re.fullmatch(r"Heading ([234])", paragraph.style.name)
        if match and int(match.group(1)) not in heading_templates:
            ppr = element.find(qn("w:pPr"))
            if ppr is not None:
                heading_templates[int(match.group(1))] = deepcopy(ppr)
    if set(heading_templates) != {2, 3, 4}:
        raise ValueError("No fue posible obtener las plantillas de títulos de la tesis")

    # Keep the thesis's existing CAPÍTULO III / MARCO METODOLÓGICO title block,
    # including the blank paragraph immediately after it.
    insert_index = chapter_title + 1
    if (
        insert_index < len(thesis_body)
        and thesis_body[insert_index].tag == qn("w:p")
        and not paragraph_text(thesis_body[insert_index], thesis)
    ):
        insert_index += 1

    preserved_section_break = next(
        (
            deepcopy(element)
            for element in reversed(list(thesis_body)[insert_index:bibliography_start])
            if element.tag == qn("w:p")
            and element.find("./" + qn("w:pPr") + "/" + qn("w:sectPr"))
            is not None
        ),
        None,
    )

    for element in list(thesis_body)[insert_index:bibliography_start]:
        thesis_body.remove(element)

    source_title = find_body_paragraph(
        source, lambda p: p.text.strip().upper() == "MARCO METODOLÓGICO"
    )
    source_refs = find_body_paragraph(
        source,
        lambda p: p.text.strip().casefold().startswith(
            "referencias nuevas para añadir a la bibliografía".casefold()
        ),
        start=source_title + 1,
    )
    copied_elements = [
        deepcopy(element)
        for element in list(source_body)[source_title + 1 : source_refs]
    ]

    map_styles(source, thesis, copied_elements)
    for element in copied_elements:
        if element.tag != qn("w:p"):
            continue
        source_style_id_node = element.find("./" + qn("w:pPr") + "/" + qn("w:pStyle"))
        if source_style_id_node is None:
            continue
        # Style names remain available through the mapped target style IDs.
        style_id = source_style_id_node.get(qn("w:val"))
        level = next(
            (
                level
                for level in (2, 3, 4)
                if style_id == thesis.styles[f"Heading {level}"].style_id
            ),
            None,
        )
        if level:
            replace_heading_properties(element, heading_templates[level], level)

    copy_numbering_definitions(source, thesis, copied_elements)
    relationship_mapping(source, thesis, copied_elements)
    scale_tables_and_images(copied_elements)

    for offset, element in enumerate(copied_elements):
        thesis_body.insert(insert_index + offset, element)
    if preserved_section_break is not None:
        thesis_body.insert(insert_index + len(copied_elements), preserved_section_break)

    # Add only the new bibliography entries supplied after the chapter.
    reference_texts = []
    for element in list(source_body)[source_refs + 1 :]:
        if element.tag != qn("w:p"):
            continue
        text = paragraph_for(element, source).text.strip()
        if not text or text.startswith("Nota: esta sección"):
            continue
        reference_texts.append(text)

    bibliography_start = find_body_paragraph(
        thesis, lambda p: p.text.strip().upper() == "BIBLIOGRAFÍA"
    )
    annexes_start = find_body_paragraph(
        thesis,
        lambda p: p.text.strip().upper() == "ANEXOS",
        start=bibliography_start + 1,
    )
    existing_texts = {
        normalized_reference_key(paragraph_for(element, thesis).text)
        for element in list(thesis_body)[bibliography_start + 1 : annexes_start]
        if element.tag == qn("w:p") and paragraph_for(element, thesis).text.strip()
    }

    bibliography_template = next(
        element
        for element in list(thesis_body)[bibliography_start + 1 : annexes_start]
        if element.tag == qn("w:p") and paragraph_for(element, thesis).text.strip()
    )
    blank_template = next(
        element
        for element in list(thesis_body)[bibliography_start + 1 : annexes_start]
        if element.tag == qn("w:p") and not paragraph_for(element, thesis).text.strip()
    )
    run_template = next(
        (child for child in bibliography_template if child.tag == qn("w:r")), None
    )

    # Keep the final placeholder in its original position and insert references before it.
    insertion_point = annexes_start
    for index in range(annexes_start - 1, bibliography_start, -1):
        element = thesis_body[index]
        if element.tag == qn("w:p") and paragraph_for(element, thesis).text.strip() == "EL NOMBRE CORRESPONDIENTE":
            insertion_point = index
            break

    added_references = 0
    for reference in reference_texts:
        key = normalized_reference_key(reference)
        if key in existing_texts:
            continue
        thesis_body.insert(
            insertion_point,
            create_text_paragraph(reference, bibliography_template, run_template),
        )
        insertion_point += 1
        thesis_body.insert(insertion_point, deepcopy(blank_template))
        insertion_point += 1
        existing_texts.add(key)
        added_references += 1

    # Ask Word/LibreOffice to refresh the TOC, lists, page numbers, and captions.
    settings = thesis.settings._element
    update_fields = settings.find(qn("w:updateFields"))
    if update_fields is None:
        update_fields = OxmlElement("w:updateFields")
        settings.append(update_fields)
    update_fields.set(qn("w:val"), "true")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    thesis.save(str(OUTPUT))
    print(f"Archivo creado: {OUTPUT}")
    print(f"Elementos insertados del capítulo: {len(copied_elements)}")
    print(f"Referencias nuevas añadidas: {added_references}")


if __name__ == "__main__":
    main()
