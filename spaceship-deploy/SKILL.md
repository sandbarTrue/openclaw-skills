# Spaceship Deploy

Deploy Node.js applications to Spaceship shared hosting via SSH.

## Prerequisites
- SSH access configured (Host alias: `spaceship` in ~/.ssh/config)
- Git repo with the project on GitHub
- Node.js app with `server.js` entry point

## Deploy Flow

### 1. First-time Setup
```bash
# SSH to server and clone repo
ssh spaceship "cd ~ && git clone <repo-url> <app-name>"

# Install dependencies
ssh spaceship "cd ~/<app-name> && npm install --production"

# Configure Passenger (.htaccess in domain root)
ssh spaceship 'cat > ~/junaitools.com/.htaccess << EOF
PassengerAppRoot "/home/ztshkzhkyl/<app-name>"
PassengerBaseURI "/"
PassengerNodejs "/home/ztshkzhkyl/.nvm/versions/node/v22.22.0/bin/node"
PassengerAppType node
PassengerStartupFile server.js
EOF'
```

### 2. Deploy Update
```bash
# Use the deploy script
bash skills/spaceship-deploy/deploy.sh <app-name> [branch]
```

### 3. Restart App (without code changes)
```bash
ssh spaceship "mkdir -p ~/<app-name>/tmp && touch ~/<app-name>/tmp/restart.txt"
```

### 4. View Logs
```bash
ssh spaceship "tail -50 ~/log/app-$(date +%Y-%m-%d).log"
```

## Environment Variables
Set in `ecosystem.config.js` or directly:
```bash
ssh spaceship "cd ~/<app-name> && echo 'KEY=value' >> .env"
```

## Domain Configuration
Managed via Spaceship cPanel. Each domain points to `~/domainname/` which uses `.htaccess` to route to the Node.js app via Passenger.

## Key Details
- Server: 66.29.148.38, Port 21098, User: ztshkzhkyl
- Node.js: v22.22.0 (via nvm)
- App server: CloudLinux Passenger (not PM2)
- Restart: `touch tmp/restart.txt` in app directory
- No port forwarding (shared hosting restriction)
- SSH remote exec works for all operations
