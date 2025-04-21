#!/bin/bash
# AI Features Setup Script for DJAI

echo "============================================"
echo "DJAI AI Features Setup"
echo "============================================"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)

if [ "$NODE_MAJOR" -lt 14 ]; then
    echo "Node.js version 14 or higher is required. You have $NODE_VERSION."
    echo "Please upgrade Node.js before continuing."
    exit 1
fi

echo "Node.js version $NODE_VERSION detected. ✓"
echo

# Check or create .env file
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp sample.env .env
    echo "ENABLE_WHISPER_LYRICS=true" >> .env
    echo "LYRICS_BUFFER_SIZE=5" >> .env
    echo ".env file created. ✓"
else
    # Check if AI config exists in .env
    if ! grep -q "ENABLE_WHISPER_LYRICS" .env; then
        echo "Adding AI configuration to .env..."
        echo "" >> .env
        echo "# AI Configuration" >> .env
        echo "ENABLE_WHISPER_LYRICS=true" >> .env
        echo "LYRICS_BUFFER_SIZE=5" >> .env
    fi
    echo ".env file exists. ✓"
fi
echo

# Install dependencies
echo "Installing base dependencies..."
npm install
echo "Base dependencies installed. ✓"
echo

# Ask if user wants to install AI dependencies
echo "The AI-powered lyrics detection requires additional dependencies:"
echo "- whisper-node (~200MB): For speech-to-text lyrics detection"
echo "- @tensorflow/tfjs-node (~150MB): For advanced audio feature extraction"
echo
read -p "Do you want to install these AI dependencies? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing AI dependencies... (this may take a few minutes)"
    npm run install-ai
    echo "AI dependencies installed. ✓"
else
    echo "Skipping AI dependencies. The system will use API-based lyrics only."
    echo "To install AI dependencies later, run: npm run install-ai"
fi
echo

# Check for Hugging Face API key
if ! grep -q "HUGGING_FACE_API_KEY=" .env || grep -q "HUGGING_FACE_API_KEY=" .env | grep -q "your_key_here"; then
    echo "For optimal video generation, a Hugging Face API key is recommended."
    echo "You can get a free key from https://huggingface.co/settings/tokens"
    read -p "Do you want to add a Hugging Face API key now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Hugging Face API key: " hf_key
        # Replace or add the key
        if grep -q "HUGGING_FACE_API_KEY=" .env; then
            sed -i "s/HUGGING_FACE_API_KEY=.*/HUGGING_FACE_API_KEY=$hf_key/" .env
        else
            echo "HUGGING_FACE_API_KEY=$hf_key" >> .env
        fi
        echo "API key added. ✓"
    else
        echo "No API key added. Video generation will use demo content."
    fi
fi
echo

echo "============================================"
echo "Setup complete! 🎵"
echo "Start the server with: npm run dev"
echo "See AI-DJ-FEATURES.md for documentation on the AI features."
echo "============================================"