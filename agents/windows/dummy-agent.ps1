# Dummy Windows Agent Script
# Este script simula un agente para pruebas.

$logPath = "$PSScriptRoot\\agent.log"
"Agente iniciado: $(Get-Date)" | Out-File -FilePath $logPath -Append
Start-Sleep -Seconds 60
