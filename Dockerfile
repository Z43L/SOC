# Dockerfile para el agente SOC-Inteligente para Linux

# Usar una imagen base de Node.js
FROM node:18-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar los archivos necesarios al contenedor
COPY package*.json ./

# Instalar las dependencias
RUN npm install

# Copiar el resto de los archivos
COPY . .

# Construir la aplicación
RUN npm run build

# Ejecutar pruebas para asegurar que todo funcione
RUN npm test

# Exponer el puerto necesario para la aplicación
EXPOSE 5000

# Copiar y configurar el script de entrada
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Reemplazar el CMD por defecto con el script de entrada
ENTRYPOINT ["./entrypoint.sh"]