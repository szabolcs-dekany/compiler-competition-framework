#!/bin/sh
set -e

ADMIN_API="http://garage:3903"
ADMIN_TOKEN="evaluator-admin-token-dev-only"

# Fixed credentials for development (ImportKey makes this idempotent)
# Garage key format: GK + 24 hex chars, secret: 64 hex chars
FIXED_ACCESS_KEY="GK00000000deadbeefcafe0001"
FIXED_SECRET_KEY="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"

apk add --no-cache curl jq

echo "Waiting for Garage to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -H "Authorization: Bearer ${ADMIN_TOKEN}" "${ADMIN_API}/v2/GetClusterStatus" > /dev/null 2>&1; then
    echo "Garage is ready!"
    break
  fi
  echo "Waiting... ($i/10)"
  sleep 2
done

# Get node ID and layout version
CLUSTER_STATUS=$(curl -fsS -H "Authorization: Bearer ${ADMIN_TOKEN}" "${ADMIN_API}/v2/GetClusterStatus")
NODE_ID=$(echo "$CLUSTER_STATUS" | jq -r '.nodes[0].id' 2>/dev/null || echo "")

LAYOUT=$(curl -fsS -H "Authorization: Bearer ${ADMIN_TOKEN}" "${ADMIN_API}/v2/GetClusterLayout")
CURRENT_VERSION=$(echo "$LAYOUT" | jq -r '.version' 2>/dev/null || echo "0")

echo "Node ID: $NODE_ID"
echo "Current layout version: $CURRENT_VERSION"

# Only update layout if version is 0 (not yet configured)
if [ -n "$NODE_ID" ] && [ "$CURRENT_VERSION" = "0" ]; then
  echo "Staging layout update..."
  curl -fsS -X POST -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"roles\":[{\"id\":\"${NODE_ID}\",\"zone\":\"dc1\",\"capacity\":1000000000,\"tags\":[]}]}" \
    "${ADMIN_API}/v2/UpdateClusterLayout"

  echo "Applying cluster layout..."
  curl -fsS -X POST -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"version":1}' \
    "${ADMIN_API}/v2/ApplyClusterLayout"
  sleep 2
fi

# Import key (idempotent - 409 means already exists which is fine)
echo "Importing access key..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"accessKeyId\":\"${FIXED_ACCESS_KEY}\",\"secretAccessKey\":\"${FIXED_SECRET_KEY}\",\"name\":\"evaluator-key\"}" \
  "${ADMIN_API}/v2/ImportKey")

if [ "$HTTP_CODE" = "200" ]; then
  echo "Key imported successfully"
elif [ "$HTTP_CODE" = "409" ]; then
  echo "Key already exists - OK"
else
  echo "Warning: ImportKey returned HTTP $HTTP_CODE"
fi

# Grant createBucket permission (idempotent)
echo "Granting createBucket permission..."
curl -fsS -X POST -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"allow":{"createBucket":true}}' \
  "${ADMIN_API}/v2/UpdateKey?id=${FIXED_ACCESS_KEY}"

echo ""
echo "============================================"
echo "Garage initialization complete!"
echo "============================================"
echo ""
echo "Add these to your .env file:"
echo "  S3_ACCESS_KEY=\"${FIXED_ACCESS_KEY}\""
echo "  S3_SECRET_KEY=\"${FIXED_SECRET_KEY}\""
echo "  S3_REGION=\"garage\""
echo "============================================"
