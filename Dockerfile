# Dockerfile para el agente SOC-Inteligente para Linux

# Usar una imagen base de Node.js
FROM node:18-alpine

# Actualizar índices de paquetes e instalar dependencias del sistema
RUN apk update && apk add --no-cache \
    bash \
    curl \
    git \
    openssh \
    python3 \
    py3-pip \
    zip \
    unzip \
    netcat-openbsd \
    make \
    g++ \
    sqlite \
    wine \
    xvfb \
    nss \
    gtk+3.0 \
    alsa-lib \
    at-spi2-atk \
    mesa-dri-gallium \
    libxcomposite \
    libxdamage \
    libxrandr \
    libxkbcommon \
    at-spi2-core

# Configure wine and electron-builder for cross-platform builds
ENV WINEARCH win64
ENV WINEPREFIX /root/.wine
ENV ELECTRON_SKIP_BINARY_DOWNLOAD 1
ENV CI true
RUN winecfg || true
# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar los archivos necesarios al contenedor
COPY package*.json ./

# Instalar las dependencias
RUN npm install
RUN npm install express zod node-cron sqlite3 && npm install --save-dev @types/node @types/express @types/node-cron
RUN npm rebuild sqlite3

# Copiar el resto de los archivos
COPY . .

# Instalar dependencias de los agentes para la compilación
WORKDIR /usr/src/app/agents
RUN npm install
WORKDIR /usr/src/app

# Construir la aplicación
RUN npm run build

# Copy enrichers to dist directory (since they're loaded dynamically)
RUN mkdir -p dist/server/integrations/enrichers
RUN cp server/enrichers.yaml dist/server/ 2>/dev/null || echo "enrichers.yaml not found, skipping"

# Skip tests for now (can be re-enabled when jest is properly configured)
# RUN npm test

# Exponer el puerto necesario para la aplicación
EXPOSE 5000

# Copiar y configurar el script de entrada
COPY entrypoint.sh ./
# --- strip possible CRLF and make it executable ---
RUN sed -i 's/\r$//' entrypoint.sh && chmod +x entrypoint.sh


# Reemplazar el CMD por defecto con el script de entrada
ENTRYPOINT ["./entrypoint.sh"]
