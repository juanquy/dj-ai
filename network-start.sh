#!/bin/bash
# Network launcher for DJAI - Starts server accessible on LAN

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
  echo -e "${GREEN}[DJAI]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[DJAI Warning]${NC} $1"
}

print_error() {
  echo -e "${RED}[DJAI Error]${NC} $1"
}

print_info() {
  echo -e "${BLUE}[DJAI Info]${NC} $1"
}

# Display banner
display_banner() {
  clear
  echo "========================================================"
  echo "           DJAI - Automatic AI DJ Server                "
  echo "========================================================"
  echo ""
}

# Get local IP addresses
get_local_ips() {
  # Get all IP addresses
  if command -v ip &> /dev/null; then
    # Linux
    IP_LIST=$(ip -4 addr show scope global | grep inet | awk '{print $2}' | cut -d/ -f1)
  elif command -v ifconfig &> /dev/null; then
    # macOS or older Linux
    IP_LIST=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}')
  else
    IP_LIST="Unable to determine IP address"
  fi
  
  echo "$IP_LIST"
}

# Check if Node.js is installed
check_node() {
  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    print_info "Please run setup.sh first to install dependencies"
    exit 1
  fi
  
  NODE_VERSION=$(node -v)
  print_info "Node.js version: $NODE_VERSION"
}

# Check if PostgreSQL is running
check_database() {
  print_info "Checking PostgreSQL status..."
  
  # Extract Database URL from the .env file
  if [ -f ".env" ]; then
    DATABASE_URL=$(grep -oP '^DATABASE_URL=\K.+' .env)
  fi
  
  # If it's a local PostgreSQL URL
  if [[ "$DATABASE_URL" == *"localhost"* || "$DATABASE_URL" == *"127.0.0.1"* || -z "$DATABASE_URL" ]]; then
    if command -v systemctl &> /dev/null && systemctl is-active --quiet postgresql; then
      print_info "PostgreSQL is running"
    elif pgrep -x "postgres" > /dev/null; then
      print_info "PostgreSQL is running"
    else
      print_warning "Local PostgreSQL is not running!"
      print_warning "User accounts and mix saving will not work without PostgreSQL."
      print_info "Attempting to start PostgreSQL service..."
      
      # Try to start PostgreSQL automatically without asking
      if command -v systemctl &> /dev/null; then
        sudo systemctl start postgresql
        if [ $? -eq 0 ]; then
          print_info "PostgreSQL started successfully"
        else
          print_error "Failed to start PostgreSQL using systemctl."
          
          # Try alternative methods
          if command -v brew &> /dev/null; then
            print_info "Trying to start PostgreSQL using Homebrew..."
            brew services start postgresql
            if [ $? -eq 0 ]; then
              print_info "PostgreSQL started successfully via Homebrew"
            else
              print_error "Failed to start PostgreSQL. Application may not work correctly."
              echo "Would you like to continue anyway? (y/n): "
              read continue_anyway
              if [[ "$continue_anyway" != "y" && "$continue_anyway" != "Y" ]]; then
                print_error "Startup aborted. Please start PostgreSQL manually and try again."
                exit 1
              fi
            fi
          else
            print_error "Could not start PostgreSQL automatically. Application may not work correctly."
            echo "Would you like to continue anyway? (y/n): "
            read continue_anyway
            if [[ "$continue_anyway" != "y" && "$continue_anyway" != "Y" ]]; then
              print_error "Startup aborted. Please start PostgreSQL manually and try again."
              exit 1
            fi
          fi
        fi
      elif command -v brew &> /dev/null; then
        print_info "Trying to start PostgreSQL using Homebrew..."
        brew services start postgresql
        if [ $? -eq 0 ]; then
          print_info "PostgreSQL started successfully"
        else
          print_error "Failed to start PostgreSQL. Application may not work correctly."
          echo "Would you like to continue anyway? (y/n): "
          read continue_anyway
          if [[ "$continue_anyway" != "y" && "$continue_anyway" != "Y" ]]; then
            print_error "Startup aborted. Please start PostgreSQL manually and try again."
            exit 1
          fi
        fi
      else
        print_error "Could not start PostgreSQL automatically. No known method available."
        echo "Would you like to continue anyway? (y/n): "
        read continue_anyway
        if [[ "$continue_anyway" != "y" && "$continue_anyway" != "Y" ]]; then
          print_error "Startup aborted. Please start PostgreSQL manually and try again."
          exit 1
        fi
      fi
    fi
    
    # Verify PostgreSQL is actually running now
    sleep 2  # Give it a moment to start
    if command -v psql &> /dev/null; then
      if ! psql -c "\conninfo" postgres > /dev/null 2>&1; then
        print_error "PostgreSQL still not running after start attempt. Application may not work correctly."
      else
        print_info "PostgreSQL connection verified successfully!"
      fi
    fi
  else
    print_info "Using external PostgreSQL connection: ${DATABASE_URL}"
  fi
}

# Check if the port is in use
check_port() {
  PORT=$(grep -oP '^PORT=\K\d+' .env 2>/dev/null || echo 3000)
  
  if command -v lsof &> /dev/null; then
    # Linux / macOS with lsof
    PORT_STATUS=$(lsof -i:$PORT -P -n 2>/dev/null)
  elif command -v netstat &> /dev/null; then
    # Alternative using netstat
    PORT_STATUS=$(netstat -tulpn 2>/dev/null | grep ":$PORT ")
  else
    PORT_STATUS=""
  fi
  
  if [ ! -z "$PORT_STATUS" ]; then
    print_warning "Port $PORT is already in use!"
    print_info "You may need to change the PORT in your .env file or stop the other service"
  fi
}

# Create uploads directory if it doesn't exist
ensure_uploads_dir() {
  if [ ! -d "uploads" ]; then
    print_info "Creating uploads directory..."
    mkdir -p uploads
  fi
}

# Start server with firewall considerations
start_server() {
  PORT=$(grep -oP '^PORT=\K\d+' .env 2>/dev/null || echo 3000)
  
  print_message "Starting DJAI on port $PORT..."
  print_info "Server will be accessible on your local network (LAN)"
  
  # Check firewall status
  if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    print_warning "Firewall detected. You may need to allow port $PORT"
    print_info "Run this command if needed: sudo ufw allow $PORT/tcp"
  elif command -v firewall-cmd &> /dev/null; then
    print_warning "Firewall detected. You may need to allow port $PORT"
    print_info "Run this command if needed: sudo firewall-cmd --permanent --add-port=$PORT/tcp && sudo firewall-cmd --reload"
  fi
  
  IP_LIST=$(get_local_ips)
  
  print_message "Server will be available at:"
  print_info "- Local: http://localhost:$PORT"
  for IP in $IP_LIST; do
    print_info "- Network: http://$IP:$PORT"
  done
  
  echo ""
  print_message "Starting server..."
  
  # Start the application
  if [ -f "package.json" ]; then
    npm start
  else
    # If not in the right directory, try to find it
    if [ -d "DJAI" ]; then
      cd DJAI
      npm start
    else
      print_error "Could not find the DJAI application."
      print_info "Make sure you are in the correct directory."
      exit 1
    fi
  fi
}

# Main function
main() {
  display_banner
  check_node
  check_database
  ensure_uploads_dir
  check_port
  
  print_message "DJAI is ready to launch!"
  print_message "This is a simplified version with:"
  print_message "- SoundCloud music without API credentials"
  print_message "- User registration with name and email only"
  print_message "- File uploads for your own music"
  print_message "- AI-powered mixing capabilities"
  print_message "- Hugging Face AI image generation for visualizations"
  echo ""
  
  start_server
}

# Run the main function
main