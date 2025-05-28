#!/bin/sh
set -e

# Wait a bit for database to initialize
echo "Waiting for database to initialize..."
sleep 10

# Apply database migrations
echo "Applying database migrations..."
npm run db:push || echo "Migration failed, but continuing..."

# Start the application
exec npm run start