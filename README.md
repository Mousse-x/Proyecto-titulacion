Nombre del proyecto:
Desarrollo de una aplicación web para evaluar la transparencia institucional en universidades públicas basado en la LOTAIP y criterios internacionales.

Objetivo:
Desarrollar una aplicación web que permita evaluar de forma objetiva, automatizada y estandarizada el nivel de transparencia institucional en las universidades públicas del Ecuador, considerando el cumplimiento de la LOTAIP y criterios internacionales de transparencia. La plataforma permite gestionar información institucional, cargar evidencias documentales, evaluar automáticamente criterios de transparencia, calcular un índice cuantitativo de cumplimiento y visualizar resultados mediante dashboards y reportes comparativos.

Tecnologías usadas:
Frontend: React.
Backend: Django y Python.
Base de datos: PostgreSQL.
Otras herramientas: Git, GitHub, Visual Studio Code, Figma y StarUML.

Cómo ejecutar el frontend:
Entrar a la carpeta frontend.
Ejecutar npm install.
Luego ejecutar npm run dev.
Normalmente quedará corriendo en http://localhost:5173

Cómo ejecutar el backend:
Entrar a la carpeta backend.
Crear el entorno virtual con python -m venv .venv (Python 3.14).
Instalar dependencias con .venv\Scripts\python.exe -m pip install -r requirements.txt
Instalar el navegador del scraper con .venv\Scripts\python.exe -m playwright install chromium
Instalar Tesseract OCR con el idioma español (spa) para el motor LOTAIP.
Crear la base PostgreSQL transparencia_universitaria con los scripts de la carpeta BD.
Ejecutar migraciones con .venv\Scripts\python.exe manage.py migrate
Crear el administrador general con .venv\Scripts\python.exe manage.py crear_admin correo@dominio.ec
Comprobar los servicios con .venv\Scripts\python.exe manage.py check_lotaip_services
Levantar el servidor con .venv\Scripts\python.exe manage.py runserver
Normalmente quedará corriendo en http://127.0.0.1:8000

Estructura (arquitectura de 3 capas, MVT de Django adaptado a JSON):
backend/core/models.py: modelos y acceso a datos (Django ORM sobre PostgreSQL).
backend/core/views/: controladores HTTP por dominio (auth, usuarios, universidades, indicadores, evidencias, validación, auditoría, feedback, dashboard).
backend/core/services/ y backend/core/lotaip_engine/: lógica de negocio (evaluación LOTAIP, índice internacional, scraper DPE, procesamiento de documentos).
backend/core/management/commands/: comandos administrativos (crear_admin, check_lotaip_services, ...).
backend/core/tests/: pruebas automatizadas.
backend/scripts/: scripts de mantenimiento que se ejecutan manualmente.
frontend/src/pages/: vistas por rol; components/: componentes compartidos; api/: cliente HTTP (Service Layer); context/ y routes/: sesión y protección de rutas.

Pruebas:
Backend: .venv\Scripts\python.exe manage.py test (requiere pg_dump y psql en el PATH).
Frontend: npm run lint, npm test y npm run build.

Autor:
Emilio Josué Pesántez Sánchez.
