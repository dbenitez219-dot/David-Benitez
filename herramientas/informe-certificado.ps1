# Informe de un certificado digital (.pfx): SOLO datos PUBLICOS.
# - La contrasena se pide de forma segura (no se ve en pantalla, no queda en el historial, no se pasa a otro programa).
# - El archivo se lee en esta computadora. Este script no usa Internet.
# - No se lee, no se muestra y no se exporta la clave privada.
# Resultado: el archivo certificado-info.txt en el Escritorio.
$ErrorActionPreference = 'Stop'
$rucEmpresa = '80139512'   # RUC de CristalAuto sin el digito verificador (para buscarlo en el certificado)

$ruta = (Read-Host 'Pega la ruta del archivo .pfx').Trim().Trim('"')
$s = Read-Host 'Contrasena del certificado (no se muestra)' -AsSecureString
try { $pfx = Get-PfxData -FilePath $ruta -Password $s }
catch { $s.Dispose(); throw 'No se pudo abrir el certificado: revisa la ruta y la contrasena.' }
$s.Dispose()

$propios = @($pfx.EndEntityCertificates)
$cadena = @($pfx.OtherCertificates)
$todos = @($propios) + @($cadena)

$L = New-Object System.Collections.Generic.List[string]
$L.Add('INFORME DE CERTIFICADO (solo datos publicos) - ' + (Get-Date -Format 's'))
$L.Add('Certificados en el archivo: ' + $todos.Count + ' (propios: ' + $propios.Count + ', de la cadena: ' + $cadena.Count + ')')

$hallazgosRuc = @(); $tieneClientAuth = $false; $tieneFirma = $false; $i = 0
foreach ($c in $todos) {
  $i++
  $esPropio = ($propios | Where-Object { $_.Thumbprint -eq $c.Thumbprint }).Count -gt 0
  $tipo = if ($esPropio) { 'PROPIO' } else { 'CADENA' }
  $L.Add(''); $L.Add("=== CERTIFICADO $i ($tipo) ===")
  $L.Add('Subject: ' + $c.Subject)
  $L.Add('Issuer: ' + $c.Issuer)
  $L.Add('Version X.509: ' + $c.Version)
  $L.Add('Algoritmo de firma: ' + $c.SignatureAlgorithm.FriendlyName + ' (' + $c.SignatureAlgorithm.Value + ')')
  try { $L.Add('Clave publica: ' + $c.PublicKey.Oid.FriendlyName + ' ' + $c.PublicKey.Key.KeySize + ' bits') } catch { $L.Add('Clave publica: ' + $c.PublicKey.Oid.FriendlyName) }
  $L.Add('Valido desde: ' + $c.NotBefore.ToString('yyyy-MM-dd') + '   hasta: ' + $c.NotAfter.ToString('yyyy-MM-dd'))
  $L.Add('Vigente hoy: ' + (((Get-Date) -ge $c.NotBefore) -and ((Get-Date) -le $c.NotAfter)))
  $L.Add('Numero de serie del certificado: ' + $c.SerialNumber)
  $emisorEnArchivo = @($todos | Where-Object { $_.Subject -eq $c.Issuer -and $_.Thumbprint -ne $c.Thumbprint }).Count -gt 0
  $L.Add('Autofirmado (raiz): ' + ($c.Subject -eq $c.Issuer) + ' | Su emisor esta dentro del archivo: ' + $emisorEnArchivo)
  if ($c.Subject -match $rucEmpresa -or $c.Subject -match 'RUC[\s:=-]?\d') { $hallazgosRuc += "certificado $i (Subject)" }
  foreach ($e in $c.Extensions) {
    $oid = $e.Oid.Value; $nombre = $e.Oid.FriendlyName
    $texto = $e.Format($true)
    $L.Add("Extension: $nombre ($oid)")
    foreach ($linea in ($texto -split "`r?`n")) { if ($linea.Trim()) { $L.Add('    ' + $linea.TrimEnd()) } }
    if ($texto -match $rucEmpresa -or $texto -match 'RUC[\s:=-]?\d') { $hallazgosRuc += "certificado $i (extension $nombre, $oid)" }
    if ($e -is [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]) {
      $L.Add('  >> Key Usage: ' + $e.KeyUsages)
      if ($esPropio -and ($e.KeyUsages.ToString() -match 'DigitalSignature')) { $tieneFirma = $true }
    }
    if ($e -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
      foreach ($u in $e.EnhancedKeyUsages) {
        $L.Add('  >> Extended Key Usage: ' + $u.FriendlyName + ' (' + $u.Value + ')')
        if ($esPropio -and $u.Value -eq '1.3.6.1.5.5.7.3.2') { $tieneClientAuth = $true }
      }
    }
  }
}

# La cadena es completa si, partiendo del certificado propio, cada emisor esta dentro del archivo hasta llegar a una raiz autofirmada
$cadenaCompleta = $false
if ($propios.Count -gt 0) {
  $actual = $propios[0]
  for ($n = 0; $n -lt 6; $n++) {
    if ($actual.Subject -eq $actual.Issuer) { $cadenaCompleta = $true; break }
    $siguiente = $todos | Where-Object { $_.Subject -eq $actual.Issuer -and $_.Thumbprint -ne $actual.Thumbprint } | Select-Object -First 1
    if (-not $siguiente) { break }
    $actual = $siguiente
  }
}

$si = { param($b) if ($b) { 'SI' } else { 'NO' } }
$L.Add(''); $L.Add('=== RESUMEN PARA SIFEN ===')
$L.Add('RUC de la empresa (' + $rucEmpresa + ') o un campo RUC encontrado en: ' + $(if ($hallazgosRuc.Count) { ($hallazgosRuc -join '; ') } else { 'NO SE ENCONTRO' }))
$L.Add('Extended Key Usage clientAuth (certificado propio): ' + (& $si $tieneClientAuth))
$L.Add('Key Usage digitalSignature (certificado propio): ' + (& $si $tieneFirma))
$L.Add('Cadena de certificacion completa dentro del archivo: ' + (& $si $cadenaCompleta))

$destino = Join-Path ([Environment]::GetFolderPath('Desktop')) 'certificado-info.txt'
Set-Content -Path $destino -Value $L -Encoding UTF8
# Control de seguridad: el informe no puede contener material de clave privada
if ((Get-Content -Path $destino -Raw) -match 'PRIVATE KEY') { Remove-Item -Path $destino -Force; throw 'Se borro el informe: contenia material de clave privada (no deberia pasar).' }
Remove-Variable pfx, propios, cadena, todos, L -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "Listo. Informe guardado en: $destino" -ForegroundColor Green
Write-Host 'Abrilo con el Bloc de notas, revisalo y adjuntalo en el chat.'
