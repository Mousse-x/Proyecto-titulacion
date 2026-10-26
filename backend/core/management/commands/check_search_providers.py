"""Diagnóstico de los buscadores directos.

Uso:
    python manage.py check_search_providers
    python manage.py check_search_providers --query "código de ética" --domain espoch.edu.ec
    python manage.py check_search_providers --map https://www.espoch.edu.ec

Cada proveedor consume una búsqueda (o un crédito) por ejecución.
"""
from django.core.management.base import BaseCommand

from core.services import search_providers as sp


class Command(BaseCommand):
    help = 'Comprueba las claves y la respuesta de cada buscador configurado.'

    def add_arguments(self, parser):
        parser.add_argument('--query', default='rendición de cuentas universidad Ecuador')
        parser.add_argument('--domain', default='')
        parser.add_argument('--map', default='', help='URL del sitio para probar Firecrawl /map')

    def handle(self, *args, **options):
        query, domain = options['query'], options['domain'] or None
        available = sp.configured_providers()
        if not available:
            self.stdout.write(self.style.WARNING('No hay claves configuradas en backend/.env.'))
            return
        domains = [domain] if domain else None
        checks = {
            'tavily': lambda: sp.tavily_search(query, 3, domains, raw_content=False),
            'exa': lambda: sp.exa_search(query, 3, domains),
            'linkup': lambda: sp.linkup_search(query, 3, domains),
            'serp': lambda: sp.serp_search(f'site:{domain} {query}' if domain else query, 3),
        }
        if options['map']:
            checks['firecrawl'] = lambda: sp.firecrawl_map(options['map'], limit=50)
        for name in ('tavily', 'exa', 'firecrawl', 'linkup', 'serp'):
            if name not in available:
                self.stdout.write(f'{name:10} sin clave')
                continue
            if name not in checks:
                self.stdout.write(f'{name:10} clave presente (usa --map URL para probarlo)')
                continue
            try:
                rows = checks[name]()
            except sp.ProviderError as exc:
                self.stdout.write(self.style.ERROR(f'{name:10} ERROR {exc}'))
                continue
            self.stdout.write(self.style.SUCCESS(f'{name:10} OK, {len(rows)} resultados'))
            for row in rows[:3]:
                self.stdout.write(f'           - {row["url"]}')
