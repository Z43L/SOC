#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Set the DATABASE_URL environment variable
export DATABASE_URL="postgresql://postgres:password@localhost:5432/soc_db"

# Ensure the application uses the correct build output directory
export BUILD_OUTPUT_DIR="dist/public"

# Build the application
echo "Building the application..."
sudo docker-compose run --rm app npm run build

# Start the Docker Compose services
echo "Starting Docker Compose services..."
sudo docker-compose up -d

# Wait for the database to be ready
echo "Waiting for the database to be ready..."
while ! sudo docker exec soc_db pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
  echo "Waiting..."
done

echo "Database is ready. Applying migrations..."
# Apply database migrations
APP_CONTAINER=$(docker ps -qf "name=soc-app")
if [ -z "$APP_CONTAINER" ]; then
  echo "Error: Application container not found."
  sudo docker ps
  exit 1
fi

echo "Running migrations in container $APP_CONTAINER..."
docker exec $APP_CONTAINER npm run db:push || {
  echo "Error: Failed to apply migrations."
  sudo docker logs $APP_CONTAINER
  exit 1
}

echo "Initialization complete. The application is running at http://localhost:5000"
