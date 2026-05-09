param(
  [Parameter(Mandatory = $true)]
  [string]$Token
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

& $ngrokExe config add-authtoken $Token
