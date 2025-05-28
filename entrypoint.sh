#!/bin/sh
set -e

# Wait for database to be ready
echo "Waiting for database to be ready..."
until nc.openbsd -z db 5432; do
  echo "Database is not ready yet. Waiting..."
  sleep 2
done
echo "Database is ready!"

# Apply database migrations
echo "Applying database migrations..."
npm run db:push

# Start the application
exec npm run start