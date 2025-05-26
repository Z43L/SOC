#!/bin/zsh
# Script para forzar el registro de un agente SOC

# 1. Eliminar archivos de configuración locales comunes (ajusta el path si tu agente usa otro)
CONFIG_FILES=(
  "$PWD/agent-config.json"
  "$PWD/agents/agent-config.json"
  "$PWD/agents/macos/agent-config.json"
  "$PWD/agents/common/agent-config.json"
)

echo "Eliminando archivos de configuración antiguos..."
for file in $CONFIG_FILES; do
  if [ -f "$file" ]; then
    echo "Borrando $file"
    rm -f "$file"
  fi
done

echo "Archivos de configuración eliminados."

# 2. (Opcional) Puedes agregar aquí comandos para reiniciar el agente automáticamente
# Por ejemplo, si tienes un script de inicio:
# echo "Reiniciando el agente..."
# ./start-agent.sh

echo "Listo. Ahora ejecuta manualmente el agente para que se registre de nuevo."
