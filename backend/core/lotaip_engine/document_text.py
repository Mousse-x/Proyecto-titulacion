"""Extracción completa de verificables; los límites técnicos dejan pendiente."""
import hashlib
import io
import logging
import re
import time
import unicodedata
import zipfile

from django.conf import settings

logger = logging.getLogger(__name__)


def extraction_error_message(exc):
    """Devuelve un diagnóstico útil sin atribuir todo fallo al OCR."""
    name = type(exc).__name__
    if isinstance(exc, TimeoutError) or name == 'RuntimeExpired':
        return f'Extracción/OCR pendiente por tiempo agotado ({name}).'
    if name == 'TesseractNotFoundError':
        return 'OCR pendiente: no se encontró el ejecutable de Tesseract.'
    if name == 'TesseractError':
        return (f'OCR pendiente ({name}). Compruebe que el idioma '
                f'{settings.LOTAIP_OCR_LANGUAGE!r} esté instalado y disponible.')
    if isinstance(exc, (ImportError, ModuleNotFoundError)):
        return f'Extracción pendiente: falta una dependencia del servidor ({name}).'
    return (f'Extracción pendiente por un error interno ({name}). '
            'No implica que falte Tesseract; revise el registro técnico del servidor.')


def readable_pdf_text(text):
    """Detecta texto ausente, glifos dañados o caracteres sueltos, no su significado."""
    compact = ''.join(text.split())
    if not compact:
        return False
    damaged = sum(c == '\ufffd' or unicodedata.category(c) in {'Co', 'Cc', 'Cs'} for c in compact)
    words = re.findall(r'[^\W\d_]+', text, re.UNICODE)
    return (damaged / len(compact) < .05
            and sum(c.isalnum() for c in compact) / len(compact) >= .5
            and (any(len(word) >= 2 for word in words) or compact.isdecimal()))


def extract_document(response, deadline=None, sample_large=False):
    body = response.get('body', b'')
    result = {'text': '', 'method': '', 'pages': 0, 'error': None,
              'sha256': hashlib.sha256(body).hexdigest(), 'ocr_pages': [],
              'sampled_pages': [], 'skipped_ocr_pages': []}
    deadline = deadline or time.monotonic() + settings.LOTAIP_PACKAGE_TIMEOUT
    try:
        import pymupdf as fitz
        from PIL import Image
        import pytesseract

        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

        def ocr(image):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Presupuesto OCR agotado')
            return pytesseract.image_to_string(image, lang=settings.LOTAIP_OCR_LANGUAGE,
                                               timeout=min(settings.LOTAIP_OCR_TIMEOUT, remaining))

        ctype = response.get('content_type', '').lower()
        if b'%PDF-' in body[:1024] or 'application/pdf' in ctype:
            with fitz.open(stream=body, filetype='pdf') as doc:
                result['pages'] = len(doc)
                if doc.is_encrypted:
                    result['error'] = 'PDF cifrado: no se pudo comprobar el contenido.'
                    return result
                semantic_pages = max(2, getattr(settings, 'LOTAIP_SEMANTIC_SAMPLE_PAGES', 10))
                if sample_large and len(doc) > settings.LOTAIP_MAX_DOCUMENT_PAGES:
                    # El texto digital es barato de extraer y permite que cada
                    # registro encuentre su propio objetivo/indicador dentro de
                    # un plan institucional compartido. Se conserva una muestra
                    # distribuida amplia, pero el OCR costoso queda limitado a
                    # ``semantic_pages`` y la IA sólo recibe su extracto final.
                    count = min(len(doc), max(semantic_pages, settings.LOTAIP_MAX_DOCUMENT_PAGES))
                    page_indices = sorted({round(index * (len(doc) - 1) / (count - 1)) for index in range(count)})
                    result['sampled_pages'] = [index + 1 for index in page_indices]
                elif len(doc) > settings.LOTAIP_MAX_DOCUMENT_PAGES:
                    result['error'] = 'Documento supera el límite de páginas y no pudo comprobarse automáticamente.'
                    return result
                else:
                    page_indices = list(range(len(doc)))
                if sample_large and len(page_indices) > semantic_pages:
                    ocr_indices = {
                        page_indices[round(index * (len(page_indices) - 1) / (semantic_pages - 1))]
                        for index in range(semantic_pages)
                    }
                else:
                    ocr_indices = set(page_indices)
                parts, used_ocr = [], False
                for page_index in page_indices:
                    page_number, page = page_index + 1, doc[page_index]
                    if time.monotonic() >= deadline:
                        raise TimeoutError('Presupuesto de extracción agotado')
                    try:
                        text = page.get_text().strip()
                        reason = '' if readable_pdf_text(text) else 'Texto ausente o ilegible'
                    except Exception:
                        text, reason = '', 'Falló la extracción de texto de la página'
                    # Una cabecera digital no debe ocultar el cuerpo escaneado.
                    if not reason and len(text) < 300:
                        if any((fitz.Rect(info['bbox']) & page.rect).get_area() > page.rect.get_area() * .5
                               for info in page.get_image_info()):
                            reason = 'Página escaneada con poco texto digital'
                    if reason:
                        if page_index not in ocr_indices:
                            result['skipped_ocr_pages'].append(page_number)
                            parts.append(text if readable_pdf_text(text) else '')
                            continue
                        result['method'] = 'pymupdf+tesseract'
                        result['ocr_pages'].append({'page': page_number, 'reason': reason})
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                        with Image.open(io.BytesIO(pix.tobytes('png'))) as image:
                            scanned = ocr(image)
                        scanned = scanned.strip()
                        # El OCR puede perder texto digital correcto. Nunca lo
                        # sustituimos por una cadena vacía ni por glifos dañados.
                        native_readable = readable_pdf_text(text)
                        if readable_pdf_text(scanned):
                            text = (text + '\n' + scanned) if native_readable and text not in scanned else scanned
                        elif native_readable:
                            if reason == 'Página escaneada con poco texto digital':
                                result['error'] = f'OCR no concluyente en el cuerpo escaneado de la página {page_number}; el texto digital sí es legible.'
                                return result
                        elif scanned or text:
                            result['error'] = f'OCR no concluyente en página {page_number}; no se acreditó legibilidad.'
                            return result
                        else:
                            text = ''
                        used_ocr = True
                    parts.append(text)
                if sample_large and parts:
                    # Conserva evidencia distribuida por todo el documento sin
                    # exceder el presupuesto enviado al modelo.
                    quota = max(500, settings.LOTAIP_MAX_DOCUMENT_CHARS // len(parts))
                    parts = [part[:quota] for part in parts]
                sampled = bool(result['sampled_pages'])
                method = 'pymupdf+tesseract' if used_ocr else 'pymupdf'
                result.update(text='\n\n'.join(parts), method=method + ('-sampled' if sampled else ''))
        elif ctype.startswith('image/') or body.startswith((b'\x89PNG', b'\xff\xd8', b'II*\x00', b'MM\x00*')):
            with Image.open(io.BytesIO(body)) as image:
                frames = getattr(image, 'n_frames', 1)
                if frames > settings.LOTAIP_MAX_DOCUMENT_PAGES:
                    raise ValueError('La imagen supera el límite de páginas.')
                parts = []
                for index in range(frames):
                    image.seek(index)
                    parts.append(ocr(image.convert('RGB')))
            result.update(text='\n\n'.join(parts), method='tesseract', pages=frames)
        elif 'html' in ctype:
            from core.services.lotaip_automatic import _VisibleText
            parser = _VisibleText()
            parser.feed(body.decode('utf-8', errors='replace'))
            result.update(text=' '.join(parser.parts), method='html', pages=1)
        elif ctype.startswith('text/') or 'json' in ctype:
            result.update(text=body.decode('utf-8-sig'), method='text', pages=1)
        elif body.startswith(b'PK') or any(token in ctype for token in (
                'spreadsheetml', 'ms-excel', 'wordprocessingml', 'msword', 'octet-stream')):
            # Muchos portales entregan Office como application/octet-stream.
            # La firma ZIP y sus rutas internas permiten distinguir XLSX/DOCX.
            try:
                with zipfile.ZipFile(io.BytesIO(body)) as archive:
                    names = set(archive.namelist())
                if 'xl/workbook.xml' in names:
                    from openpyxl import load_workbook
                    workbook = load_workbook(io.BytesIO(body), read_only=True, data_only=True)
                    sheet_count = len(workbook.sheetnames)
                    parts, cells = [], 0
                    for sheet in workbook.worksheets:
                        parts.append(sheet.title)
                        for row in sheet.iter_rows(values_only=True):
                            values = [str(value) for value in row if value not in (None, '')]
                            if values:
                                parts.append(' | '.join(values))
                            cells += len(row)
                            if cells >= 50000 or sum(map(len, parts)) >= settings.LOTAIP_MAX_DOCUMENT_CHARS:
                                break
                        if cells >= 50000 or sum(map(len, parts)) >= settings.LOTAIP_MAX_DOCUMENT_CHARS:
                            break
                    workbook.close()
                    result.update(text='\n'.join(parts), method='openpyxl', pages=sheet_count)
                elif 'word/document.xml' in names:
                    from docx import Document
                    document = Document(io.BytesIO(body))
                    parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
                    for table in document.tables:
                        parts.extend(' | '.join(cell.text for cell in row.cells) for row in table.rows)
                    result.update(text='\n'.join(parts), method='python-docx', pages=1)
                else:
                    result['error'] = 'Archivo ZIP sin un documento XLSX o DOCX reconocible.'
            except (zipfile.BadZipFile, ValueError, KeyError):
                result['error'] = 'Documento Office inválido o no compatible.'
        else:
            result['error'] = 'Tipo de verificable no soportado para extracción automática.'
        if len(result['text']) > settings.LOTAIP_MAX_DOCUMENT_CHARS and sample_large:
            result['text'] = result['text'][:settings.LOTAIP_MAX_DOCUMENT_CHARS]
        elif len(result['text']) > settings.LOTAIP_MAX_DOCUMENT_CHARS:
            result.update(text='', error='El contenido supera el límite de análisis; no se evaluó parcialmente.')
    except Exception as exc:
        logger.exception('Falló la extracción del verificable (%s)', type(exc).__name__)
        result.update(text='', error=extraction_error_message(exc),
                      error_type=type(exc).__name__)
    return result
