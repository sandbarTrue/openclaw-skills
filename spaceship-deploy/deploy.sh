#!/bin/bash
# Spaceship Deploy Script
# Usage: deploy.sh <app-name> [branch] [--install]
# Example: deploy.sh jun-ai-tools main --install

set -e

APP_NAME="${1:?Usage: deploy.sh <app-name> [branch] [--install]}"
BRANCH="${2:-main}"
INSTALL_FLAG="${3}"
SSH_HOST="spaceship"
REMOTE_DIR="/home/ztshkzhkyl/${APP_NAME}"

echo "🚀 Deploying ${APP_NAME} (branch: ${BRANCH})"

# Step 1: Pull latest code
echo "📥 Pulling latest code..."
ssh ${SSH_HOST} "cd ${REMOTE_DIR} && git fetch origin && git checkout ${BRANCH} && git pull origin ${BRANCH}" 2>&1

# Step 2: Install dependencies (if --install flag or package-lock changed)
if [ "$INSTALL_FLAG" = "--install" ]; then
    echo "📦 Installing dependencies..."
    ssh ${SSH_HOST} "cd ${REMOTE_DIR} && npm install --production" 2>&1
fi

# Step 3: Restart Passenger
echo "🔄 Restarting application..."
ssh ${SSH_HOST} "mkdir -p ${REMOTE_DIR}/tmp && touch ${REMOTE_DIR}/tmp/restart.txt"

# Step 4: Verify
echo "✅ Checking app status..."
sleep 3
ssh ${SSH_HOST} "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:3000/ 2>/dev/null || echo 'App restarting...'"

echo ""
echo "🎉 Deploy complete: ${APP_NAME}"
