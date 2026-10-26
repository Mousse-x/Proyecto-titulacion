"""Diagnóstico local de OCR y conexión opcional con FreeLLMAPI."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Comprueba Tesseract y configuración de FreeLLMAPI sin mostrar secretos.'

    def add_arguments(self, parser):
        parser.add_argument('--probe', action='store_true', help='Enviar una prueba sintética a FreeLLMAPI.')

    def handle(self, *args, **options):
        import pymupdf
        import PIL
        import pytesseract
        self.stdout.write(f'PyMuPDF {pymupdf.VersionBind}; Pillow {PIL.__version__}; pytesseract {pytesseract.__version__}')
        if settings.TESSERACT_CMD:
            pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        failures = []
        try:
            self.stdout.write(f'Tesseract: {pytesseract.get_tesseract_version()}')
            languages = pytesseract.get_languages(config='')
            missing = set(settings.LOTAIP_OCR_LANGUAGE.split('+')) - set(languages)
            if missing:
                failures.append('Faltan idiomas OCR: ' + ', '.join(sorted(missing)))
        except Exception:
            failures.append('Tesseract no está disponible. Configure TESSERACT_CMD y el idioma spa.')
        configured = bool(settings.FREELLMAPI_BASE_URL and settings.FREELLMAPI_API_KEY)
        self.stdout.write(f'FreeLLMAPI: {"configurado" if configured else "pendiente de URL y clave"}; modelo: {settings.FREELLMAPI_MODEL}')
        if not configured:
            failures.append('Falta configurar FREELLMAPI_BASE_URL y/o FREELLMAPI_API_KEY.')
        if options['probe'] and configured:
            from core.lotaip_engine.freellm import analyze_correspondence
            result = analyze_correspondence('Acta DEMO-123. Se recibió una donación de tres libros el 1 de agosto de 2026.',
                {'numeral':19,'campo':'Acta de donativo','registro':{'acta':'DEMO-123','cantidad':3,'objeto':'libros'}})
            if result.get('corresponde') is True and not result.get('error'):
                self.stdout.write(self.style.SUCCESS('Prueba sintética FreeLLMAPI correcta.'))
            else:
                failures.append(result.get('error') or 'La prueba no confirmó correspondencia.')
        if failures:
            raise CommandError('\n'.join(failures))
        self.stdout.write(self.style.SUCCESS('Servicios listos.'))
