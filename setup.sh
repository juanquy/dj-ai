#!/bin/bash
# Setup script for DJAI - Automatic AI DJ with PostgreSQL and Admin Setup

# Text colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
  echo -e "${GREEN}[DJAI Setup]${NC} $1"
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

# Check if Node.js is installed
check_node() {
  print_message "Checking Node.js installation..."
  
  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    print_message "Installing Node.js..."
    
    # Try to install Node.js based on the OS
    if command -v apt-get &> /dev/null; then
      # Debian/Ubuntu
      curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
      # RHEL/CentOS/Fedora
      curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
      sudo yum install -y nodejs
    elif command -v brew &> /dev/null; then
      # macOS with Homebrew
      brew install node
    else
      print_error "Automatic Node.js installation failed. Please install Node.js manually from https://nodejs.org/"
      exit 1
    fi
  fi
  
  # Check Node.js version
  NODE_VERSION=$(node -v)
  print_message "Node.js version: $NODE_VERSION installed"
  
  # Check if npm is installed
  if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH!"
    exit 1
  fi
  
  NPM_VERSION=$(npm -v)
  print_message "npm version: $NPM_VERSION installed"
}

# Install PostgreSQL
install_postgresql() {
  print_message "Checking PostgreSQL installation..."
  
  if command -v psql &> /dev/null; then
    print_message "PostgreSQL is already installed!"
    
    # Try to get version
    PG_VERSION=$(psql --version | cut -d ' ' -f 3)
    print_message "PostgreSQL version: $PG_VERSION"
    return 0
  fi
  
  print_message "PostgreSQL is not installed. Installing PostgreSQL..."
  
  # Detect operating system
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
  elif command -v lsb_release &> /dev/null; then
    OS=$(lsb_release -si)
  elif [ -f /etc/lsb-release ]; then
    . /etc/lsb-release
    OS=$DISTRIB_ID
  else
    OS=$(uname -s)
  fi
  
  # Install based on OS
  case $OS in
    *Ubuntu*|*Debian*)
      print_info "Detected Ubuntu/Debian. Installing PostgreSQL..."
      sudo apt-get update
      sudo apt-get install -y postgresql postgresql-contrib
      sudo systemctl start postgresql
      sudo systemctl enable postgresql
      ;;
    *CentOS*|*Red\ Hat*|*RHEL*|*Fedora*)
      print_info "Detected CentOS/RHEL/Fedora. Installing PostgreSQL..."
      sudo yum install -y postgresql-server postgresql-contrib
      sudo postgresql-setup --initdb
      sudo systemctl start postgresql
      sudo systemctl enable postgresql
      ;;
    *Darwin*)
      print_info "Detected macOS. Installing PostgreSQL using Homebrew..."
      brew install postgresql
      brew services start postgresql
      ;;
    *)
      print_warning "Could not detect OS. Please install PostgreSQL manually."
      print_warning "DJAI will use PostgreSQL to store user accounts and mixes."
      print_warning "After installing PostgreSQL manually, run this setup script again."
      exit 1
      ;;
  esac
  
  # Check if PostgreSQL installation was successful
  if command -v psql &> /dev/null; then
    print_message "PostgreSQL successfully installed!"
    return 0
  else
    print_error "PostgreSQL installation may have failed."
    exit 1
  fi
}

# Check PostgreSQL connection and setup database
setup_postgresql() {
  print_message "Setting up PostgreSQL database..."
  
  # Check if PostgreSQL is running
  if command -v systemctl &> /dev/null && systemctl list-units --type=service | grep -q postgresql; then
    if ! systemctl is-active --quiet postgresql; then
      print_warning "PostgreSQL service is installed but not running."
      print_info "Starting PostgreSQL service..."
      sudo systemctl start postgresql
      
      if [ $? -ne 0 ]; then
        print_error "Failed to start PostgreSQL. Please start it manually."
        exit 1
      fi
    fi
  elif command -v brew &> /dev/null && brew services list | grep -q postgresql; then
    # Check if PostgreSQL is running via Homebrew
    if ! brew services list | grep postgresql | grep -q started; then
      print_warning "PostgreSQL service is installed but not running."
      print_info "Starting PostgreSQL service..."
      brew services start postgresql
      
      if [ $? -ne 0 ]; then
        print_error "Failed to start PostgreSQL. Please start it manually."
        exit 1
      fi
    fi
  fi
  
  # Create database user and database
  print_info "Creating database user and database..."
  
  # Generate random password for PostgreSQL user
  DB_PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 12)
  
  # Create the database and user (sudo to postgres user)
  sudo -u postgres psql -c "CREATE USER djaiuser WITH PASSWORD '${DB_PASSWORD}';" || true
  sudo -u postgres psql -c "CREATE DATABASE djai OWNER djaiuser;" || true
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE djai TO djaiuser;" || true
  
  print_message "PostgreSQL database 'djai' and user 'djaiuser' created!"
  print_info "Database connection will be configured in .env file"
  
  # Save the database credentials for later use
  DB_URL="postgres://djaiuser:${DB_PASSWORD}@localhost:5432/djai"
}

# Setup environment variables
setup_env() {
  print_message "Setting up environment variables..."
  
  if [ -f ".env" ]; then
    print_warning ".env file already exists. Creating backup at .env.backup"
    cp .env .env.backup
  fi
  
  # Generate a random SESSION_SECRET
  RANDOM_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32)
  
  # Create .env file
  cat > .env << EOF
# Database connection string
DATABASE_URL=${DB_URL}

# Session secret (auto-generated)
SESSION_SECRET=${RANDOM_SECRET}

# Port (optional, defaults to 3000)
PORT=3000

# File upload options
MAX_UPLOAD_SIZE=50 # In megabytes
EOF
  
  print_message ".env file created with PostgreSQL connection and session secret"
}

# Install dependencies
install_dependencies() {
  print_message "Installing project dependencies..."
  
  # Check if package.json exists
  if [ ! -f "package.json" ]; then
    print_error "package.json not found! Make sure you're in the correct directory."
    exit 1
  fi
  
  # Install PostgreSQL adapter packages
  npm install pg pg-hstore sequelize express-session-sequelize
  
  # Install AI DJ mixing dependencies
  print_message "Installing AI DJ mixing dependencies..."
  npm install meyda essentia.js web-audio-beat-detector
  
  # Install Hugging Face SDK for AI image generation
  print_message "Installing Hugging Face SDK for AI image generation..."
  npm install @huggingface/inference
  
  # Install other dependencies
  npm install
  
  if [ $? -ne 0 ]; then
    print_error "Dependency installation failed. Trying with legacy peer deps..."
    npm install --legacy-peer-deps
    
    if [ $? -ne 0 ]; then
      print_error "Dependency installation failed again. Please check your internet connection and try manually."
      exit 1
    fi
  fi
  
  print_message "Dependencies installed successfully!"
  print_message "Advanced AI DJ mixing features have been installed!"
}

# Create necessary directories if they don't exist
ensure_directories() {
  print_message "Ensuring all required directories exist..."
  
  # Check and create directories
  for dir in "src" "public" "views" "uploads"; do
    if [ ! -d "$dir" ]; then
      print_warning "Creating missing directory: $dir"
      mkdir -p "$dir"
    fi
  done
}

# Main function
main() {
  print_message "Starting DJAI setup..."
  
  # Make sure we're in the right directory
  if [ ! -f "package.json" ] && [ -d "DJAI" ]; then
    cd DJAI
  fi
  
  # Check and install Node.js
  check_node
  
  # Install and setup PostgreSQL
  install_postgresql
  setup_postgresql
  
  # Create directories and install dependencies
  ensure_directories
  install_dependencies
  
  # Setup environment file
  setup_env
  
  print_message "Setup completed successfully!"
  print_message "==================== NEXT STEPS ======================"
  print_message "1. For LOCAL testing, run:"
  print_message "   npm start"
  print_message ""
  print_message "2. For NETWORK access (to access from other devices), run:"
  print_message "   ./network-start.sh"
  print_message ""
  print_message "3. For development with auto-restart, run:"
  print_message "   npm run dev"
  print_message ""
  print_message "4. Admin access:"
  print_message "   Sign up with any email"
  print_message "   Navigate to the /admin-setup URL to create the first admin user"
  print_message "====================================================="
}

# Run the main function
main