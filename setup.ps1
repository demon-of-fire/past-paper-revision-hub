$ErrorActionPreference = "Stop"

Write-Host "Installing the local PDF-to-Word converter..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

Write-Host ""
Write-Host "Setup complete. Start the app with:"
Write-Host "node server.js"
