# Despliegue de SisTransp en un servidor casero (Linux + Cloudflare Tunnel)

```
Internet → Cloudflare (HTTPS) → cloudflared → Nginx :8088
                                               ├─ /         → /var/www/sistransp (frontend compilado)
                                               ├─ /api/     → Gunicorn 127.0.0.1:8000 (Django)
                                               ├─ /django-admin/ → Gunicorn (admin de Django; /admin/* es del frontend)
                                               ├─ /static/  → backend/staticfiles
                                               └─ /media/   → backend/media
```

No se abre ningún puerto del router: el túnel sale desde el servidor hacia Cloudflare.

## 0. Configuración (ya preparada en el código)

- `backend/config/settings.py` lee todo desde `backend/.env`. Sin variables
  funciona como en desarrollo; con `DEBUG=False` exige `SECRET_KEY`.
- Plantilla de producción: `backend/.env.production.example`.
- `FIELD_ENCRYPTION_KEY` **debe ser la misma** que en el equipo de desarrollo.
- `frontend/.env.production` fija `VITE_API_URL=/api` para `npm run build`.
- `requirements.txt` instala `python-magic` y `gunicorn` en Linux.

## 1. Paquetes del sistema (Ubuntu Server 22.04/24.04)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx tesseract-ocr tesseract-ocr-spa libmagic1 build-essential curl postgresql-common
# PostgreSQL 18 (misma versión que desarrollo; Ubuntu trae una anterior que no restaura el dump)
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-18
sudo ufw allow OpenSSH && sudo ufw enable
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.bashrc
uv python install 3.14
```

Node 20+ (solo si compilas el frontend en el servidor):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

## 2. Código

```bash
sudo mkdir -p /opt/sistransp && sudo chown $USER /opt/sistransp
git clone https://github.com/Mousse-x/Proyecto-titulacion.git /opt/sistransp
```

Copia aparte `backend/media/` (las evidencias no están en Git), por ejemplo con WinSCP.

## 3. Base de datos

En Windows (la carpeta `despliegue/` está en `.gitignore`):

```bash
pg_dump -U postgres -h 127.0.0.1 -Fc --no-owner --no-privileges transparencia_universitaria -f despliegue/sistransp.dump
tar -czf despliegue/media.tar.gz -C backend media
scp despliegue/sistransp.dump despliegue/media.tar.gz despliegue/env-servidor USUARIO@IP-DEL-SERVIDOR:~
```

En el servidor (la contraseña es la de `DB_PASSWORD` en `env-servidor`):

```bash
sudo -u postgres psql -c "CREATE USER sistransp WITH PASSWORD 'LA_DE_DB_PASSWORD';" -c "CREATE DATABASE transparencia_universitaria OWNER sistransp;"
sudo -u postgres pg_restore -d transparencia_universitaria --no-owner --role=sistransp ~/sistransp.dump
sudo -u postgres psql -c "ALTER ROLE sistransp SET search_path = core,universities,transparency,evaluation,evidence,catalogs,public;"
tar -xzf ~/media.tar.gz -C /opt/sistransp/backend
cp ~/env-servidor /opt/sistransp/backend/.env && chmod 600 /opt/sistransp/backend/.env
```

## 4. Backend

```bash
cd /opt/sistransp/backend
uv venv --python 3.14 .venv && source .venv/bin/activate
uv pip install -r requirements.txt
playwright install --with-deps chromium
nano .env      # ya copiado en el paso 3: ajusta ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS y FRONTEND_URL
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
```

`check --deploy` mostrará 3 avisos esperados (W005, W008, W021): la redirección
a HTTPS la hace Cloudflare.

## 5. Gunicorn (servicio systemd)

`/etc/systemd/system/sistransp.service` — un solo proceso con hilos, porque las
evaluaciones LOTAIP corren en hilos de segundo plano dentro del proceso web:

```ini
[Unit]
Description=SisTransp (Django + Gunicorn)
After=network.target postgresql.service

[Service]
User=TU_USUARIO
WorkingDirectory=/opt/sistransp/backend
ExecStart=/opt/sistransp/backend/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 1 --threads 8 --timeout 300
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now sistransp
sudo systemctl status sistransp
```

## 6. Frontend

```bash
cd /opt/sistransp/frontend && npm ci && npm run build
sudo mkdir -p /var/www/sistransp && sudo cp -r dist/* /var/www/sistransp/
```

## 7. Nginx

`/etc/nginx/sites-available/sistransp`:

```nginx
server {
    listen 8088;   # el 80 lo usa CasaOS en torre1
    server_name _;
    client_max_body_size 50M;

    root /var/www/sistransp;
    index index.html;

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self' blob:;" always;

    # index.html siempre se revalida; los assets llevan hash y se cachean.
    # (expires y no add_header: un add_header aquí anularía las cabeceras de seguridad)
    location / {
        try_files $uri /index.html;
        expires -1;
    }
    location /assets/ { expires 1y; }

    # /admin/* son rutas del frontend; el admin de Django está en /django-admin/
    location ~ ^/(api|django-admin)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
    location /static/ { alias /opt/sistransp/backend/staticfiles/; }
    location /media/  { alias /opt/sistransp/backend/media/; }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/sistransp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
```

Nginx (usuario `www-data`) necesita poder leer `/opt/sistransp/backend/media`
y `staticfiles`: `chmod o+rx /opt /opt/sistransp /opt/sistransp/backend` y
`chmod -R o+rX /opt/sistransp/backend/media /opt/sistransp/backend/staticfiles`.

## 8. Cloudflare Tunnel

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**A. URL gratis temporal** (cambia en cada reinicio):

```bash
cloudflared tunnel --url http://localhost:8088
```

Añade el dominio `*.trycloudflare.com` mostrado a `ALLOWED_HOSTS`,
`CSRF_TRUSTED_ORIGINS` y `FRONTEND_URL`, y reinicia `sistransp`.

**B. Dominio propio** (URL fija; el dominio debe estar en Cloudflare, plan Free):

```bash
cloudflared tunnel login
cloudflared tunnel create sistransp
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <ID-DEL-TUNEL>
credentials-file: /home/TU_USUARIO/.cloudflared/<ID-DEL-TUNEL>.json
ingress:
  - hostname: sistransp.tudominio.com
    service: http://localhost:8088
  - service: http_status:404
```

```bash
cloudflared tunnel route dns sistransp sistransp.tudominio.com
sudo cloudflared --config /home/TU_USUARIO/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
```

En el panel de Cloudflare: SSL/TLS → *Always Use HTTPS* activado.

## 9. Mantenimiento

```bash
# Actualizar
cd /opt/sistransp && git pull
cd backend && source .venv/bin/activate && uv pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput
sudo systemctl restart sistransp
cd ../frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/sistransp/

# Logs
journalctl -u sistransp -f
journalctl -u cloudflared -f

# Respaldo diario (crontab -e); la contraseña va en ~/.pgpass (chmod 600):
#   127.0.0.1:5432:transparencia_universitaria:sistransp:CONTRASEÑA
0 3 * * * pg_dump -U sistransp -h 127.0.0.1 -Fc transparencia_universitaria > ~/respaldos/sistransp_$(date +\%F).dump
```

Límites del plan Free de Cloudflare: 100 MB por petición y 100 s por respuesta.
