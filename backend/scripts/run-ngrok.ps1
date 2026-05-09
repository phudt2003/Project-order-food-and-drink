param(
  [int]$Port = 4000
)

$ngrokExe = "C:\nvm\nodejs\node_modules\ngrok\bin\ngrok.exe"

if (-not (Test-Path $ngrokExe)) {
  Write-Error "Khong tim thay ngrok tai: $ngrokExe"
  exit 1
}

# Clear proxy variables so ngrok can connect directly.
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:GIT_HTTPS_PROXY -ErrorAction SilentlyContinue

Write-Host "Dang mo ngrok tunnel cho http://localhost:$Port ..."
& $ngrokExe http $Port --log=stdout
