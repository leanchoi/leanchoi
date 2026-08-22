<#
.SYNOPSIS
  Arma hostinger-deploy.zip: todo lo que va en public_html.

.DESCRIPTION
  Gemelo de package-hostinger.sh para Windows. Hace exactamente lo mismo y
  verifica lo mismo, así que el zip que sale de una máquina y el que sale de la
  otra tienen el mismo contenido.

  Lo que arma:
    public_html/
      index.html            la SPA (juego y /admin)
      assets/               bundle con hash: JS, CSS y mapas
      prefabs/              fachadas voxelizadas de los edificios reales
      .htaccess             enrutamiento SPA, /api, GZIP, cache y seguridad
      api/                  los endpoints PHP
      src/                  clases PHP (autoload PSR-4, sin Composer)
      config/               database.php y el ejemplo de configuracion
      database/             schema.sql, migraciones y seeds para phpMyAdmin

  Nunca empaqueta config/local.php ni ningun .env: ahi viven las credenciales.

.PARAMETER SkipBuild
  Usa el client/dist que ya esta, sin recompilar.

.PARAMETER NoMaps
  Saca los source maps del paquete (pesa bastante menos).

.EXAMPLE
  .\tools\deploy\package-hostinger.ps1
  .\tools\deploy\package-hostinger.ps1 -SkipBuild -NoMaps
#>

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoMaps
)

$ErrorActionPreference = 'Stop'

$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Salida = Join-Path $Raiz 'dist-deploy'
$Stage = Join-Path $Salida 'public_html'
$Zip = Join-Path $Raiz 'hostinger-deploy.zip'

Write-Host "-> Esquel 2027 - empaquetado para Hostinger"
Write-Host "   raiz: $Raiz"

# --- 1. Compilar ------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Host "-> Verificando tipos en los cuatro paquetes..."
  Push-Location $Raiz
  try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "El typecheck fallo." }

    Write-Host "-> Compilando el cliente en modo produccion..."
    npm run build --workspace client
    if ($LASTEXITCODE -ne 0) { throw "El build del cliente fallo." }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "-> Salteando la compilacion (-SkipBuild)"
}

if (-not (Test-Path (Join-Path $Raiz 'client\dist\index.html'))) {
  throw "No hay build del cliente en client\dist. Correlo sin -SkipBuild."
}

# --- 2. Armar el arbol ------------------------------------------------------
Write-Host "-> Armando el arbol de public_html..."
if (Test-Path $Salida) { Remove-Item $Salida -Recurse -Force }
New-Item -ItemType Directory -Path $Stage -Force | Out-Null

Copy-Item (Join-Path $Raiz 'client\dist\*') $Stage -Recurse -Force

if ($NoMaps) {
  Write-Host "   . sacando los source maps"
  Get-ChildItem (Join-Path $Stage 'assets') -Filter '*.map' -ErrorAction SilentlyContinue |
    Remove-Item -Force
}

$PrefabsOrigen = Join-Path $Raiz 'client\public\prefabs'
$PrefabsDestino = Join-Path $Stage 'prefabs'
if ((Test-Path $PrefabsOrigen) -and (-not (Test-Path $PrefabsDestino))) {
  New-Item -ItemType Directory -Path $PrefabsDestino -Force | Out-Null
  Copy-Item (Join-Path $PrefabsOrigen '*') $PrefabsDestino -Recurse -Force
}

Copy-Item (Join-Path $Raiz 'backend-php\.htaccess') (Join-Path $Stage '.htaccess') -Force

foreach ($dir in @('api', 'src', 'config', 'database')) {
  New-Item -ItemType Directory -Path (Join-Path $Stage $dir) -Force | Out-Null
}
Copy-Item (Join-Path $Raiz 'backend-php\api\*') (Join-Path $Stage 'api') -Recurse -Force
Copy-Item (Join-Path $Raiz 'backend-php\src\*') (Join-Path $Stage 'src') -Recurse -Force
Copy-Item (Join-Path $Raiz 'backend-php\config\database.php') (Join-Path $Stage 'config') -Force
Copy-Item (Join-Path $Raiz 'backend-php\config\config.example.php') (Join-Path $Stage 'config') -Force
Copy-Item (Join-Path $Raiz 'backend-php\database\*') (Join-Path $Stage 'database') -Recurse -Force

# Nunca se empaquetan credenciales, pase lo que pase.
Remove-Item (Join-Path $Stage 'config\local.php') -Force -ErrorAction SilentlyContinue
Get-ChildItem $Stage -Recurse -Force -Include '.env*', '*.log' -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

# --- 3. Verificar lo que no puede faltar -------------------------------------
Write-Host "-> Verificando el contenido..."
$Requeridos = @(
  'index.html', '.htaccess', 'assets', 'api\auth\login.php',
  'api\intelligence\ingest.php', 'api\intelligence\metrics.php',
  'api\sync\flush-stats.php', 'src\Db.php', 'config\database.php',
  'database\schema.sql'
)
$Falta = $false
foreach ($req in $Requeridos) {
  if (-not (Test-Path (Join-Path $Stage $req))) {
    Write-Host "   x falta $req" -ForegroundColor Red
    $Falta = $true
  }
}
if (Test-Path (Join-Path $Stage 'config\local.php')) {
  Write-Host "   x config\local.php quedo adentro del paquete: eso lleva credenciales." -ForegroundColor Red
  $Falta = $true
}
if ($Falta) { throw "El paquete esta incompleto." }

# --- 4. Comprimir ------------------------------------------------------------
Write-Host "-> Comprimiendo..."
if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $Zip -CompressionLevel Optimal -Force

# Compress-Archive se saltea los archivos ocultos: el .htaccess se agrega aparte.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivo = [System.IO.Compression.ZipFile]::Open($Zip, 'Update')
try {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $archivo, (Join-Path $Stage '.htaccess'), '.htaccess') | Out-Null
} finally {
  $archivo.Dispose()
}

$Tamano = '{0:N1} MB' -f ((Get-Item $Zip).Length / 1MB)
Write-Host ""
Write-Host "OK: $Zip - $Tamano" -ForegroundColor Green
Write-Host ""
Write-Host "  Ahora, en Hostinger:"
Write-Host "   1. hPanel -> Bases de datos -> crear la base y el usuario."
Write-Host "   2. phpMyAdmin -> importar database/schema.sql y despues los seeds."
Write-Host "   3. Administrador de archivos -> subir el zip a public_html y extraer."
Write-Host "   4. Copiar config/config.example.php a config/local.php y completarlo."
Write-Host ""
Write-Host "  El paso a paso completo esta en docs/prompts/DEPLOY-GUIDE.md"
