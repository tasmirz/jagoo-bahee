#!/bin/bash

# MinIO CORS Setup using Docker
# This script sets up CORS for MinIO running in Docker

set -e

echo "🚀 Setting up MinIO CORS using Docker..."

BUCKET_NAME="${MINIO_BUCKET:-uploads}"

# Create CORS config file
cat > /tmp/minio-cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

echo "📦 Creating bucket and setting CORS..."

# Use docker exec to run mc commands inside the MinIO container
docker exec minio sh -c "
  # Install mc if not present
  if ! command -v mc &> /dev/null; then
    wget -q https://dl.min.io/client/mc/release/linux-amd64/mc -O /tmp/mc
    chmod +x /tmp/mc
    MC_CMD=/tmp/mc
  else
    MC_CMD=mc
  fi
  
  # Configure mc
  \$MC_CMD alias set local http://localhost:9000 minioadmin minioadmin
  
  # Create bucket
  \$MC_CMD mb local/${BUCKET_NAME} --ignore-existing
  
  # Set public read policy
  \$MC_CMD anonymous set download local/${BUCKET_NAME}
  
  echo 'Bucket created and policy set'
"

# Copy CORS file into container and apply it
docker cp /tmp/minio-cors.json minio:/tmp/cors.json

docker exec minio sh -c "
  if ! command -v mc &> /dev/null; then
    MC_CMD=/tmp/mc
  else
    MC_CMD=mc
  fi
  
  # Set CORS
  \$MC_CMD cors set /tmp/cors.json local/${BUCKET_NAME}
  
  # Verify
  echo ''
  echo 'Current CORS configuration:'
  \$MC_CMD cors get local/${BUCKET_NAME}
"

rm /tmp/minio-cors.json

echo ""
echo "✨ MinIO CORS setup complete!"
echo ""
echo "📋 Bucket: ${BUCKET_NAME}"
echo "🔗 Console: http://localhost:9001"
echo "   Username: minioadmin"
echo "   Password: minioadmin"
echo ""
