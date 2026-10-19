<#
  Llena la tabla movies de Supabase con películas completas de OMDb.
  Usa la API key de OMDb y la anon key de Supabase de js/config.js.

  Uso (desde la carpeta del proyecto):
    powershell -ExecutionPolicy Bypass -File scripts\seed-movies.ps1            # hasta 1000 películas en total
    powershell -ExecutionPolicy Bypass -File scripts\seed-movies.ps1 -Target 1500

  Se puede ejecutar las veces que haga falta: salta las películas ya guardadas
  (sin gastar cuota de OMDb en ellas) y para al agotar la cuota diaria.
#>
param(
  [int]$Target = 1000,        # total de películas que queremos en la base
  [int]$PagesPerTerm = 3      # páginas de 10 resultados por cada término de búsqueda
)

$ErrorActionPreference = 'Stop'

# ---------- configuración (de js/config.js) ----------
$config = Get-Content (Join-Path $PSScriptRoot '..\js\config.js') -Raw -Encoding UTF8
$omdbKey = [regex]::Match($config, "apiKey:\s*'([^']+)'").Groups[1].Value
$sbUrl = [regex]::Match($config, "url:\s*'([^']+)'").Groups[1].Value.TrimEnd('/')
$sbKey = [regex]::Match($config, "anonKey:\s*'([^']+)'").Groups[1].Value
if (-not $omdbKey -or -not $sbUrl -or -not $sbKey) { throw 'Faltan apiKey, supabase.url o supabase.anonKey en js/config.js' }
$rest = "$sbUrl/rest/v1"

# Términos variados para cubrir géneros y épocas; los primeros resultados de OMDb suelen ser los más conocidos.
$terms = @(
  'star wars', 'star trek', 'harry potter', 'lord of the rings', 'batman', 'superman', 'spider-man', 'avengers',
  'x-men', 'james bond', 'mission impossible', 'fast and furious', 'jurassic', 'alien', 'terminator', 'rocky',
  'toy story', 'shrek', 'pirates of the caribbean', 'indiana jones', 'back to the future', 'matrix', 'godfather',
  'transformers', 'planet of the apes', 'die hard', 'john wick', 'hunger games', 'twilight', 'saw', 'scream',
  'halloween', 'pixar', 'disney', 'love', 'war', 'man', 'woman', 'night', 'day', 'life', 'world', 'king', 'queen',
  'dead', 'girl', 'boy', 'house', 'city', 'time', 'dark', 'last', 'black', 'blood', 'american', 'story', 'dream',
  'game', 'heart', 'secret', 'lost', 'island', 'princess', 'dragon', 'ghost', 'zombie', 'monster', 'space', 'fire',
  'water', 'ice', 'money', 'kill', 'love story', 'christmas', 'summer', 'school', 'family', 'father', 'mother',
  'brother', 'sister', 'friends', 'hero', 'legend', 'revenge', 'escape', 'red', 'blue', 'gold', 'sun', 'moon', 'road'
)

# ---------- HTTP (WebClient en UTF-8; devuelve el cuerpo también en errores HTTP) ----------
function Invoke-Http([string]$Url, [string]$Body = '', [hashtable]$Headers = @{}) {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [System.Text.Encoding]::UTF8
  foreach ($k in $Headers.Keys) { $wc.Headers.Add($k, $Headers[$k]) }
  try {
    # Ojo: un parámetro [string] convierte $null en '', así que se comprueba vacío, no $null.
    if ([string]::IsNullOrEmpty($Body)) { return $wc.DownloadString($Url) }
    return $wc.UploadString($Url, 'POST', $Body)
  } catch [System.Net.WebException] {
    if (-not $_.Exception.Response) { throw }
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream(), [System.Text.Encoding]::UTF8)
    return $reader.ReadToEnd()
  } finally { $wc.Dispose() }
}

$sbHeaders = @{ apikey = $sbKey; Authorization = "Bearer $sbKey" }

function Get-Omdb([hashtable]$Params) {
  $query = ($Params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
  $script:omdbRequests++
  return Invoke-Http "https://www.omdbapi.com/?apikey=$omdbKey&$query"
}

function Get-MovieCount {
  $wc = New-Object System.Net.WebClient
  foreach ($k in $sbHeaders.Keys) { $wc.Headers.Add($k, $sbHeaders[$k]) }
  $wc.Headers.Add('Prefer', 'count=exact')
  [void]$wc.DownloadString("$rest/movies?select=imdb_id&limit=1")
  $total = [int](($wc.ResponseHeaders['Content-Range'] -split '/')[1])
  $wc.Dispose()
  return $total
}

function Get-ExistingIds([string[]]$Ids) {
  if (-not $Ids.Count) { return @() }
  $found = Invoke-Http "$rest/movies?select=imdb_id&imdb_id=in.($($Ids -join ','))" -Headers $sbHeaders | ConvertFrom-Json
  return @($found | ForEach-Object { $_.imdb_id })
}

# Fila de la tabla movies: columnas + respuesta original de OMDb tal cual (sin pasar por ConvertTo-Json).
function New-MovieRow([string]$Raw) {
  $m = $Raw | ConvertFrom-Json
  $poster = if ($m.Poster -and $m.Poster -ne 'N/A') { $m.Poster } else { $null }
  $cols = [ordered]@{ imdb_id = $m.imdbID; title = $m.Title; year = $m.Year; poster = $poster } | ConvertTo-Json -Compress
  return $cols.Substring(0, $cols.Length - 1) + ',"omdb":' + $Raw + '}'
}

function Save-Movies([string[]]$Rows) {
  $headers = $sbHeaders.Clone()
  $headers['Content-Type'] = 'application/json'
  $headers['Prefer'] = 'resolution=ignore-duplicates,return=minimal'
  $result = Invoke-Http "$rest/movies" -Body ('[' + ($Rows -join ',') + ']') -Headers $headers
  if ($result) { throw "Supabase rechazó la inserción: $result" }
}

# ---------- carga ----------
$script:omdbRequests = 0
$total = Get-MovieCount
$saved = 0
$seen = @{}
Write-Host "En la base: $total películas. Objetivo: $Target."

:outer foreach ($term in $terms) {
  for ($page = 1; $page -le $PagesPerTerm; $page++) {
    if ($total -ge $Target) { break outer }

    $search = Get-Omdb @{ s = $term; type = 'movie'; page = $page } | ConvertFrom-Json
    if ($search.Response -ne 'True') {
      if ($search.Error -eq 'Request limit reached!') { Write-Host 'Cuota diaria de OMDb agotada.'; break outer }
      break   # sin más resultados para este término
    }

    $ids = @($search.Search | ForEach-Object { $_.imdbID } | Where-Object { -not $seen.ContainsKey($_) })
    $ids | ForEach-Object { $seen[$_] = $true }
    $existing = Get-ExistingIds $ids
    $rows = @()

    foreach ($id in ($ids | Where-Object { $existing -notcontains $_ })) {
      if ($total + $rows.Count -ge $Target) { break }
      $raw = Get-Omdb @{ i = $id; plot = 'full' }
      $detail = $raw | ConvertFrom-Json
      if ($detail.Response -eq 'True') { $rows += New-MovieRow $raw; continue }
      if ($detail.Error -eq 'Request limit reached!') {
        if ($rows.Count) { Save-Movies $rows; $total += $rows.Count; $saved += $rows.Count }
        Write-Host 'Cuota diaria de OMDb agotada.'
        break outer
      }
      Write-Host "  - $id omitida: $($detail.Error)"
    }

    if ($rows.Count) { Save-Movies $rows; $total += $rows.Count; $saved += $rows.Count }
    Write-Host ("[{0} p.{1}] +{2} nuevas | total {3} | peticiones OMDb {4}" -f $term, $page, $rows.Count, $total, $script:omdbRequests)
    if ($page -ge [math]::Ceiling([int]$search.totalResults / 10)) { break }
  }
}

$final = Get-MovieCount
Write-Host ""
Write-Host "Listo: $saved películas nuevas en esta ejecución. Total en la base: $final. Peticiones a OMDb: $($script:omdbRequests)."
if ($final -lt $Target) { Write-Host "Faltan $($Target - $final). Vuelve a ejecutar el script mañana (la cuota de OMDb se renueva cada 24 h)." }
