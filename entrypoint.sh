#!/bin/sh
set -e

# Apply database migrations
echo "Applying database migrations..."
npm run db:push

# Start the application
exec npm run start