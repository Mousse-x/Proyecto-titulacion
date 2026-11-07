"""Preparación segura de esquemas PostgreSQL exclusivamente para pruebas."""
from django.test.runner import DiscoverRunner
from django.db import connections
from django.apps import apps
from pathlib import Path
import os
import re
import shutil
import subprocess

SCHEMAS = ("core", "universities", "transparency", "evaluation", "evidence", "catalogs", "audit")

class SchemaAwareTestRunner(DiscoverRunner):
    def setup_test_environment(self, **kwargs):
        super().setup_test_environment(**kwargs)
        # Las pruebas nunca consumen créditos de los buscadores reales, aunque
        # backend/.env tenga claves configuradas.
        from django.conf import settings
        settings.SEARCH_DIRECT_ENABLED = False
        settings.LOTAIP_LINK_RETRY_DELAY_SECONDS = 0

    def build_suite(self, test_labels=None, **kwargs):
        # Sin etiquetas, limitar el descubrimiento a la aplicación Django para
        # que los scripts de ``scripts/`` nunca se importen como pruebas.
        return super().build_suite(test_labels or ["core"], **kwargs)

    def setup_databases(self, **kwargs):
        connection = connections["default"]
        test_name = connection.creation._get_test_db_name()
        production_name = connection.settings_dict["NAME"]
        if not str(test_name).startswith("test_") or test_name == production_name:
            raise RuntimeError(f"Nombre de base de pruebas inseguro: {test_name}")
        import psycopg
        params = connection.get_connection_params().copy()
        params["dbname"] = "postgres"
        with psycopg.connect(**params, autocommit=True) as admin:
            from psycopg import sql
            admin.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid <> pg_backend_pid()", (test_name,))
            admin.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(test_name)))
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(test_name)))
        params["dbname"] = test_name
        with psycopg.connect(**params, autocommit=True) as test_db:
            for schema in SCHEMAS:
                test_db.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        # Copia solamente la definición de tablas legacy ``managed=False``.
        # pg_dump lee producción; psql escribe exclusivamente en la base test_*.
        pg_dump, psql = shutil.which("pg_dump"), shutil.which("psql")
        if not pg_dump or not psql:
            raise RuntimeError("pg_dump y psql son necesarios para preparar las tablas legacy de pruebas")
        tables = []
        for model in apps.get_models():
            if model._meta.managed:
                continue
            match = re.fullmatch(r'"([^\"]+)"\."([^\"]+)"', model._meta.db_table)
            if match:
                tables.append(f"{match.group(1)}.{match.group(2)}")
        # ``core.users`` nació como tabla legacy unmanaged en 0001 y cambió a
        # managed en 0005; esa migración altera estado, pero no crea la tabla.
        tables.append("core.users")
        base_args = ["-h", str(connection.settings_dict["HOST"]), "-p", str(connection.settings_dict["PORT"]),
                     "-U", str(connection.settings_dict["USER"])]
        env = os.environ.copy()
        env["PGPASSWORD"] = str(connection.settings_dict.get("PASSWORD", ""))
        dump_cmd = [pg_dump, *base_args, "-d", str(production_name), "--schema-only", "--no-owner", "--no-privileges"]
        for table in sorted(set(tables)):
            dump_cmd.extend(["--table", table])
        dump = subprocess.run(dump_cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        restored = subprocess.run([psql, *base_args, "-d", str(test_name), "--set", "ON_ERROR_STOP=1"], env=env,
                                  input=dump.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if restored.returncode:
            raise RuntimeError("No se pudo preparar el esquema legacy de pruebas: " + restored.stderr.decode(errors="replace"))
        # La base ya existe y contiene los esquemas requeridos. Django aplica
        # todas las migraciones sin intentar recrearla en esta fase.
        self.keepdb = True
        return super().setup_databases(**kwargs)
