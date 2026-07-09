FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY . .

ENV PLAYWRIGHT_EXECUTABLE_PATH=""
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# La imagen slim no trae curl/wget: healthcheck con python.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health',timeout=4).status==200 else 1)"

CMD ["python", "-m", "app.cli", "serve"]
