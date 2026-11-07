from pathlib import Path
from collections import Counter
from docx import Document
from docx.oxml.ns import qn
from lxml import etree


FILES = [
    Path(r"C:\Users\Usuario\Downloads\Capitulo_III_SisTransp_usabilidad.docx"),
    Path(r"C:\Users\Usuario\Downloads\tesis_SisTransp_capitulo_III_reestructurado_usabilidad.docx"),
]


def xml_text(element):
    return "".join(element.itertext()).strip()


for path in FILES:
    doc = Document(str(path))
    print(f"\nFILE: {path}")
    print("DOCUMENT RELATIONSHIPS")
    for rel_id, rel in doc.part.rels.items():
        if rel.is_external or "image" in rel.reltype or "chart" in rel.reltype or "ole" in rel.reltype:
            print(rel_id, rel.reltype, "external=" + str(rel.is_external), rel.target_ref)

    for level in range(1, 5):
        paragraph = next(
            (
                p
                for p in doc.paragraphs
                if p.text.strip() and p.style.name == f"Heading {level}"
            ),
            None,
        )
        if paragraph is None:
            continue
        print(f"\nHEADING {level}: {paragraph.text!r}")
        print("style_id:", paragraph.style.style_id)
        print("paragraph properties:")
        print(
            etree.tostring(paragraph._p.pPr, encoding="unicode", pretty_print=True)
            if paragraph._p.pPr is not None
            else "(none)"
        )
        print("style definition:")
        print(etree.tostring(paragraph.style._element, encoding="unicode", pretty_print=True))

    num_ids = Counter()
    for element in doc._element.body.iter():
        if element.tag == qn("w:numId"):
            num_ids[element.get(qn("w:val"))] += 1
    print("numbering ids used:", num_ids)
    body = list(doc._element.body)
    for index, element in enumerate(body):
        text = xml_text(element)
        if text.startswith("CAPÍTULO III") or text.startswith("BIBLIOGRAFÍA") or text.startswith(
            "Referencias nuevas"
        ):
            print("boundary", index, text[:100])
