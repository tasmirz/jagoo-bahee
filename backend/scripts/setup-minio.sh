#!/bin/bash

# MinIO Setup Script
# This script configures MinIO with proper CORS settings for browser uploads

set -e

echo "🚀 Setting up MinIO..."

# MinIO connection details
MINIO_HOST="${MINIO_HOST:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"
MINIO_BUCKET="${MINIO_BUCKET:-uploads}"

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    echo "⚠️  MinIO Client (mc) is not installed."
    echo "Installing mc..."
    
    # Detect OS and install accordingly
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget https://dl.min.io/client/mc/release/linux-amd64/mc
        chmod +x mc
        sudo mv mc /usr/local/bin/
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install minio/stable/mc
    else
        echo "Please install MinIO Client manually from: https://min.io/docs/minio/linux/reference/minio-mc.html"
        exit 1
    fi
fi

# Configure mc alias
echo "📝 Configuring MinIO client..."
mc alias set myminio http://${MINIO_HOST} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}

# Create bucket if it doesn't exist
echo "📦 Creating bucket: ${MINIO_BUCKET}..."
mc mb myminio/${MINIO_BUCKET} --ignore-existing

# Set bucket to public read
echo "🔓 Setting bucket policy to public read..."
mc anonymous set download myminio/${MINIO_BUCKET}

# Set CORS policy
echo "🌐 Setting CORS policy..."
cat > /tmp/minio-cors.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"]
    }
  ]
}
EOF

mc cors set /tmp/minio-cors.json myminio/${MINIO_BUCKET}

# Verify CORS
echo "✅ Verifying CORS configuration..."
mc cors get myminio/${MINIO_BUCKET}

echo ""
echo "✨ MinIO setup complete!"
echo ""
echo "📋 Configuration:"
echo "   Host: ${MINIO_HOST}"
echo "   Bucket: ${MINIO_BUCKET}"
echo "   Console: http://${MINIO_HOST/9000/9001}"
echo ""
echo "🔗 Test URLs:"
echo "   Console: http://localhost:9001"
echo "   API: http://localhost:9000"
echo ""
