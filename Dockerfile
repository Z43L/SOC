# Dockerfile para el agente SOC-Inteligente para Linux

# Build stage
FROM node:18-slim AS builder

# Update repositories and install build dependencies
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    git \
    make \
    g++ \
    python3 \
    sqlite3 \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar los archivos necesarios al contenedor
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies)
RUN npm install

# Copiar el resto de los archivos
COPY . .

# Construir la aplicación
RUN npm run build

# Copy enrichers to dist directory (since they're loaded dynamically)
RUN mkdir -p dist/server/integrations/enrichers
RUN cp server/enrichers.yaml dist/server/ 2>/dev/null || echo "enrichers.yaml not found, skipping"

# Production stage
FROM node:18-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    netcat-openbsd \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar los archivos necesarios al contenedor
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm install --production && npm cache clean --force

# Copiar la aplicación construida desde el build stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/client/dist ./client/dist

# Exponer el puerto necesario para la aplicación
EXPOSE 5000

# Copiar y configurar el script de entrada
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Reemplazar el CMD por defecto con el script de entrada
ENTRYPOINT ["./entrypoint.sh"]