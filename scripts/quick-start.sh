#!/bin/bash

# Quick Start Script for Background Jobs System
# This script automates the setup and verification of the background job system

# Text formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print header
echo -e "${BOLD}=========================================${NC}"
echo -e "${BOLD}   Background Jobs System Quick Start    ${NC}"
echo -e "${BOLD}=========================================${NC}"
echo ""

# Check if running with correct permissions
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Please do not run this script as root${NC}"
  exit 1
fi

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to check environment variables
check_env_var() {
  if [ -z "${!1}" ]; then
    echo -e "  ${RED}✗ $1 is not set${NC}"
    return 1
  else
    echo -e "  ${GREEN}✓ $1 is set${NC}"
    return 0
  fi
}

# Step 1: Check prerequisites
echo -e "${BOLD}Step 1: Checking prerequisites...${NC}"

# Check Node.js
if command_exists node; then
  NODE_VERSION=$(node -v)
  echo -e "  ${GREEN}✓ Node.js is installed ($NODE_VERSION)${NC}"
else
  echo -e "  ${RED}✗ Node.js is not installed${NC}"
  echo -e "    Please install Node.js 18 or later: https://nodejs.org/"
  exit 1
fi

# Check npm
if command_exists npm; then
  NPM_VERSION=$(npm -v)
  echo -e "  ${GREEN}✓ npm is installed ($NPM_VERSION)${NC}"
else
  echo -e "  ${RED}✗ npm is not installed${NC}"
  echo -e "    Please install npm: https://www.npmjs.com/get-npm"
  exit 1
fi

# Check if .env file exists
if [ -f .env.local ]; then
  echo -e "  ${GREEN}✓ .env.local file exists${NC}"
  
  # Load environment variables
  export $(grep -v '^#' .env.local | xargs)
  
  # Check required environment variables
  ENV_ERROR=0
  
  echo -e "\n  ${BOLD}Checking environment variables:${NC}"
  
  # Supabase
  check_env_var "NEXT_PUBLIC_SUPABASE_URL" || ENV_ERROR=1
  check_env_var "NEXT_PUBLIC_SUPABASE_ANON_KEY" || ENV_ERROR=1
  check_env_var "SUPABASE_SERVICE_ROLE_KEY" || ENV_ERROR=1
  
  # OpenAI
  check_env_var "OPENAI_API_KEY" || ENV_ERROR=1
  
  # Cloudinary
  check_env_var "CLOUDINARY_CLOUD_NAME" || ENV_ERROR=1
  check_env_var "CLOUDINARY_API_KEY" || ENV_ERROR=1
  check_env_var "CLOUDINARY_API_SECRET" || ENV_ERROR=1
  
  # Background Jobs
  check_env_var "ENABLE_AUTO_PROCESSING" || echo -e "  ${YELLOW}⚠ ENABLE_AUTO_PROCESSING not set, using default: true${NC}"
  check_env_var "JOB_PROCESSING_INTERVAL" || echo -e "  ${YELLOW}⚠ JOB_PROCESSING_INTERVAL not set, using default: 30000${NC}"
  check_env_var "MAX_CONCURRENT_JOBS" || echo -e "  ${YELLOW}⚠ MAX_CONCURRENT_JOBS not set, using default: 3${NC}"
  
  if [ $ENV_ERROR -eq 1 ]; then
    echo -e "\n  ${RED}✗ Some required environment variables are missing${NC}"
    echo -e "    Please check .env.local file and set all required variables"
    echo -e "    You can copy .env.production.example to .env.local and fill in your values"
    exit 1
  fi
else
  echo -e "  ${RED}✗ .env.local file does not exist${NC}"
  echo -e "    Creating .env.local from .env.production.example..."
  
  if [ -f .env.production.example ]; then
    cp .env.production.example .env.local
    echo -e "  ${GREEN}✓ Created .env.local from .env.production.example${NC}"
    echo -e "  ${YELLOW}⚠ Please edit .env.local and set your environment variables${NC}"
    echo -e "    Then run this script again"
    exit 1
  else
    echo -e "  ${RED}✗ .env.production.example file does not exist${NC}"
    echo -e "    Please create .env.local file manually"
    exit 1
  fi
fi

echo -e "\n${GREEN}✓ Prerequisites check passed${NC}"

# Step 2: Install dependencies
echo -e "\n${BOLD}Step 2: Installing dependencies...${NC}"

if [ -f package.json ]; then
  npm install
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
  else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ package.json file does not exist${NC}"
  echo -e "  Please run this script from the project root directory"
  exit 1
fi

# Step 3: Run database migrations
echo -e "\n${BOLD}Step 3: Running database migrations...${NC}"

# Check if Supabase CLI is available
if command_exists supabase; then
  echo -e "  ${GREEN}✓ Supabase CLI is installed${NC}"
  
  # Run migrations
  echo -e "  Running migrations..."
  supabase db push
  
  if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓ Migrations applied successfully${NC}"
  else
    echo -e "  ${RED}✗ Failed to apply migrations${NC}"
    echo -e "    Please check Supabase connection and try again"
    echo -e "    Alternatively, you can run migrations manually from Supabase dashboard"
    echo -e "    Migration files are located in supabase/migrations/"
  fi
else
  echo -e "  ${YELLOW}⚠ Supabase CLI is not installed${NC}"
  echo -e "    Please run migrations manually from Supabase dashboard"
  echo -e "    Migration files are located in supabase/migrations/"
  
  # Ask if user wants to continue
  read -p "  Continue without running migrations? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Step 4: Build the application
echo -e "\n${BOLD}Step 4: Building the application...${NC}"

npm run build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Application built successfully${NC}"
else
  echo -e "${RED}✗ Failed to build application${NC}"
  exit 1
fi

# Step 5: Start the development server
echo -e "\n${BOLD}Step 5: Starting the development server...${NC}"

# Start the server in the background
npm run dev &
SERVER_PID=$!

# Wait for server to start
echo -e "  Waiting for server to start..."
sleep 10

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "  ${GREEN}✓ Development server started successfully on port 3001${NC}"
else
  echo -e "  ${RED}✗ Failed to start development server${NC}"
  exit 1
fi

# Step 6: Test the API endpoints
echo -e "\n${BOLD}Step 6: Testing API endpoints...${NC}"

# Get base URL
BASE_URL="http://localhost:3001"

# Test health endpoint
echo -e "  Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/jobs/health")

if [[ $HEALTH_RESPONSE == *"status"* ]]; then
  echo -e "  ${GREEN}✓ Health endpoint is working${NC}"
else
  echo -e "  ${RED}✗ Health endpoint is not working${NC}"
  echo -e "    Response: $HEALTH_RESPONSE"
fi

# Test job processing endpoint
echo -e "  Testing job processing endpoint..."
PROCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/jobs/process" \
  -H "Content-Type: application/json" \
  -d '{"maxJobs": 1, "forceProcessing": true}')

if [[ $PROCESS_RESPONSE == *"processed"* ]]; then
  echo -e "  ${GREEN}✓ Job processing endpoint is working${NC}"
else
  echo -e "  ${RED}✗ Job processing endpoint is not working${NC}"
  echo -e "    Response: $PROCESS_RESPONSE"
fi

# Test cartoonize job endpoint
echo -e "  Testing cartoonize job endpoint..."
CARTOONIZE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/jobs/cartoonize/start" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test character", "style": "storybook"}')

if [[ $CARTOONIZE_RESPONSE == *"jobId"* ]]; then
  echo -e "  ${GREEN}✓ Cartoonize job endpoint is working${NC}"
  
  # Extract job ID
  JOB_ID=$(echo $CARTOONIZE_RESPONSE | grep -o '"jobId":"[^"]*' | sed 's/"jobId":"//')
  
  if [ ! -z "$JOB_ID" ]; then
    echo -e "    Created job ID: $JOB_ID"
    
    # Test job status endpoint
    echo -e "  Testing job status endpoint..."
    STATUS_RESPONSE=$(curl -s "$BASE_URL/api/jobs/cartoonize/status/$JOB_ID")
    
    if [[ $STATUS_RESPONSE == *"status"* ]]; then
      echo -e "  ${GREEN}✓ Job status endpoint is working${NC}"
    else
      echo -e "  ${RED}✗ Job status endpoint is not working${NC}"
      echo -e "    Response: $STATUS_RESPONSE"
    fi
  fi
else
  echo -e "  ${RED}✗ Cartoonize job endpoint is not working${NC}"
  echo -e "    Response: $CARTOONIZE_RESPONSE"
fi

# Step 7: Stop the development server
echo -e "\n${BOLD}Step 7: Stopping the development server...${NC}"

kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
echo -e "${GREEN}✓ Development server stopped${NC}"

# Step 8: Final instructions
echo -e "\n${BOLD}Step 8: Final instructions${NC}"
echo -e "  ${GREEN}✓ Background job system is set up and ready to use${NC}"
echo -e "\n  To start the development server:"
echo -e "    ${BOLD}npm run dev${NC}"
echo -e "\n  To build and start the production server:"
echo -e "    ${BOLD}npm run build${NC}"
echo -e "    ${BOLD}npm start${NC}"
echo -e "\n  To deploy to production:"
echo -e "    ${BOLD}npm run deploy${NC}"
echo -e "\n  For more information, see the documentation:"
echo -e "    ${BOLD}BACKGROUND_JOBS_INTEGRATION.md${NC}"
echo -e "    ${BOLD}API_DOCUMENTATION.md${NC}"
echo -e "    ${BOLD}TESTING_GUIDE.md${NC}"
echo -e "    ${BOLD}MONITORING_SETUP.md${NC}"
echo -e "    ${BOLD}PERFORMANCE_OPTIMIZATION.md${NC}"

echo -e "\n${BOLD}=========================================${NC}"
echo -e "${BOLD}   Quick Start Completed Successfully    ${NC}"
echo -e "${BOLD}=========================================${NC}"