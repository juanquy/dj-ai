#!/bin/bash
# DJAI - Complete deployment script (setup + network start)

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}      DJAI - Automatic AI DJ Deployment Script      ${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""
echo "This script will:"
echo "1. Run the setup process (install dependencies)"
echo "2. Configure MongoDB connection"
echo "3. Start the server with network access enabled"
echo ""
echo -e "${YELLOW}Requirements:${NC}"
echo "- Node.js and npm"
echo "- MongoDB (local or remote connection)"
echo ""
echo "Press ENTER to continue or CTRL+C to cancel..."
read

# Run setup script first
echo "Running setup script..."
chmod +x ./setup.sh
./setup.sh

# Check if setup was successful
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}Setup encountered issues. Check the errors above.${NC}"
  echo "Do you want to continue anyway? (y/n)"
  read continue_anyway
  
  if [[ "$continue_anyway" != "y" && "$continue_anyway" != "Y" ]]; then
    echo "Deployment aborted. Please fix the issues and try again."
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}Setup process completed!${NC}"
echo ""
echo "Starting network server in 3 seconds..."
sleep 3

# Start network server
chmod +x ./network-start.sh
./network-start.sh