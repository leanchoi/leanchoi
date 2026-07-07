FROM python:3.11-slim

# Dependencias del sistema para Chromium las instala "playwright install --with-deps"
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY . .

# En Docker dejamos que Playwright use el Chromium que acaba de instalar
ENV PLAYWRIGHT_EXECUTABLE_PATH=""
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000
CMD ["python", "-m", "app.cli", "serve"]
