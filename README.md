# DJAI - Automatic AI DJ

A Node.js + Express application that creates an automatic AI DJ that can mix tracks from SoundCloud (no API credentials required) and your own uploaded music.

## Features

- **No Authentication Required**: Use SoundCloud music without needing API credentials
- **User Registration**: Simple signup with just name and email
- **File Upload Support**: Add your own music files to the mix
- **AI Mixing**: Intelligent track ordering and transition points based on BPM and other factors
- **Mix Saving**: Save your favorite mixes (Free tier: up to 5 mixes)
- **Profile Management**: Track your mixes and uploads
- **Responsive Design**: Works on desktop and mobile devices
- **Dark/Light Theme**: Switch between light and dark modes

## Technologies Used

- **Backend**: Node.js + Express
- **Database**: MongoDB for user data and session storage
- **Audio Processing**: music-metadata for file analysis
- **SoundCloud Integration**: Client ID extraction technique (no API required)
- **Frontend**: Vanilla JavaScript with EJS templating
- **Styling**: CSS with light/dark theming
- **File Handling**: Multer for file uploads

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager
- MongoDB (local or remote)

## Setup Instructions

### One-Step Deployment (Recommended)

Use the all-in-one deployment script to setup and start the application:

```bash
./deploy.sh
```

This script will:
1. Run the setup process (install dependencies, configure environment)
2. Start the server with network access enabled

### Separate Setup & Run

Alternatively, you can run the setup and start processes separately:

#### 1. Setup

```bash
./setup.sh
```

The setup script will:
- Check for Node.js and npm installation
- Install or fix missing dependencies
- Create an .env file from sample.env (or create one if missing)
- Generate a random session secret
- Verify all required directories exist

#### 2. Start Server

For network access (recommended):
```bash
./network-start.sh
```

Or for local-only access:
```bash
npm start
```

### Manual Setup

If you prefer to set up manually:

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/djai.git
cd djai
```

2. **Install dependencies**

```bash
npm install
```

3. **Create environment variables**

Copy the sample.env file to .env:

```bash
cp sample.env .env
```

Edit the .env file:

```
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/djai

# Session secret (change this to a random string for security)
SESSION_SECRET=your_random_secret_string_change_this

# Port (optional, defaults to 3000)
PORT=3000

# File upload options
MAX_UPLOAD_SIZE=50 # In megabytes
```

4. **Run the application**

Local development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Network access mode (accessible from other devices on your LAN):
```bash
./network-start.sh
```

The server will start at:
- Local access: http://localhost:3000
- Network access: http://YOUR_LOCAL_IP:3000 (displayed when using network-start.sh)

## Usage

### User Registration

1. Visit the homepage and enter your name and email
2. No password is required - we keep it simple!
3. You'll be immediately logged in and can start using the application

### Finding Music

DJAI offers two ways to add music to your mix:

1. **SoundCloud Search**
   - Search for tracks by name, artist, etc.
   - Add SoundCloud tracks via direct URL
   - No SoundCloud account or API credentials required

2. **Upload Your Music**
   - Upload MP3, WAV, FLAC and other audio files
   - Files are analyzed for BPM and other metadata
   - Mix your uploaded tracks with SoundCloud tracks

### Creating an AI Mix

1. Add at least 2 tracks to your mix (from SoundCloud, your uploads, or both)
2. Click "Generate AI Mix" 
3. The AI will analyze and arrange the tracks in an optimal order based on BPM
4. View detailed information about the mix including transition points
5. Use the advanced player to listen to your mix with automatic transitions
6. Save your mix if you want to access it later

### Advanced Player Features

The DJAI player includes sophisticated audio mixing capabilities:

- **Automatic Crossfading**: Smooth transitions between tracks at optimized points
- **Audio Visualizer**: Real-time frequency visualization of the currently playing track
- **Precise Controls**: Play/pause, previous/next track controls, and seek functionality
- **Track Progress**: Visual progress bar with transition point markers
- **Playlist Navigation**: Easily navigate between tracks in your mix
- **Track Highlighting**: Currently playing track is highlighted in the track list
- **Unified Audio Sources**: Seamless mixing between uploaded files and SoundCloud tracks

### Premium Features (Coming Soon)

- Unlimited saved mixes (Free tier: 5 mixes)
- Higher quality audio processing
- Advanced mixing options
- AI-generated continuous mixes

## Technical Details

### SoundCloud No-Auth Integration

The application uses a technique to access SoundCloud's public API without requiring official API credentials:

1. **Client ID Extraction**: Automatically extracts the client ID from SoundCloud's web player
2. **Search & Streaming**: Enables searching and streaming tracks from SoundCloud
3. **URL Resolution**: Allows adding tracks via SoundCloud URLs
4. **Caching**: Client ID is cached and refreshed as needed

### Audio File Handling

For uploaded audio files:

1. **Storage**: Files are stored in user-specific directories
2. **Metadata Extraction**: Tags, BPM, and other metadata are extracted
3. **Range Requests**: Support for seeking within audio files
4. **Format Support**: Multiple audio formats supported (MP3, WAV, FLAC, etc.)

### Mix Generation

The AI mixing algorithm:

1. **Track Analysis**: Analyzes BPM and other characteristics 
2. **Ordering**: Arranges tracks in an optimal sequence
3. **Transition Points**: Calculates where tracks should blend together
4. **BPM Matching**: Orders tracks to minimize BPM differences between consecutive tracks

### Audio Mixing Technology

The DJAI player uses advanced Web Audio API techniques for professional-quality mixing:

1. **Web Audio API**: Creates a dynamic audio graph with multiple sources and gain nodes
2. **Crossfading Engine**: Implements precise volume curves for smooth transitions
3. **Audio Analysis**: Real-time frequency analysis for visualization
4. **Multi-source Management**: Handles both local uploads and streaming sources seamlessly
5. **Error Resilience**: Robust error handling for network interruptions and streaming issues
6. **Range Requests**: Supports seeking within audio files using HTTP range requests
7. **Adaptive Buffering**: Pre-loads upcoming tracks to ensure smooth transitions

## API Endpoints

### User Management
- `/api/user/register` - Register new user (POST)
- `/api/user/profile` - Get user profile (GET)
- `/api/user/saved-mixes` - Get user's saved mixes (GET)
- `/api/user/save-mix` - Save a new mix (POST)
- `/api/user/logout` - Log out (POST)

### File Upload
- `/api/upload/track` - Upload a new track (POST)
- `/api/upload/tracks` - List user's uploaded tracks (GET)
- `/api/upload/stream/:trackId` - Stream an uploaded track (GET)

### SoundCloud
- `/api/soundcloud/search` - Search for tracks (GET)
- `/api/soundcloud/resolve` - Resolve a SoundCloud URL (GET)
- `/api/soundcloud/stream/:trackId` - Stream a SoundCloud track (GET)
- `/api/soundcloud/generate-mix` - Generate a mix from track IDs (POST)

## Network Access (LAN Setup)

DJAI can be run on your local network, allowing other devices (phones, tablets, computers) to access the DJ application:

### Using the Network Start Script

1. Run the provided network script:
   ```bash
   ./network-start.sh
   ```

2. The script will:
   - Display all available network IP addresses for your machine
   - Start the server on all network interfaces
   - Show the URLs you can use to access the app

3. Access from other devices:
   - Use the displayed network URL (e.g., `http://192.168.1.5:3000`) from any device on your LAN
   - Works with phones, tablets, and other computers

## Developer Guide

### Audio Player Customization

The DJAI player uses a custom `AudioMixer` class that handles all aspects of audio playback and visualization. Here's how you can customize or extend the player:

#### Key Components

1. **AudioMixer Class**: Located in the main `index.ejs` file, this class handles:
   - Audio element creation and management
   - Web Audio API node creation and connection
   - Transitions and crossfading
   - Visualization
   - UI updates and controls

2. **Initialization**:
   ```javascript
   // Initialize with mix data
   function initializeMixPlayer(mixData) {
     if (!mixer) {
       mixer = new AudioMixer();
     }
     mixer.initialize(mixData);
     // Auto-start
     mixer.play();
   }
   ```

3. **Crossfade Configuration**:
   - Modify the `transitionTime` property (default: 5000ms) to adjust crossfade duration
   ```javascript
   // In the AudioMixer constructor
   this.transitionTime = 5000; // Crossfade duration in ms
   ```

4. **Visualizer Customization**:
   - The `drawVisualizer()` method can be modified to change the appearance
   - Adjust the canvas dimensions, bar colors, animation style, etc.

5. **Adding Effects**:
   - Add audio effects by modifying the `createAudioElements()` method
   - Insert additional AudioNodes in the connection chain
   ```javascript
   // Example: Adding a compressor effect
   const compressor = this.audioContext.createDynamicsCompressor();
   source.connect(compressor);
   compressor.connect(gainNode);
   ```

#### Error Handling

The streaming routes include robust error handling that you can further extend:

1. **Client-side**: In the `AudioMixer` class, error handlers are attached to audio elements
2. **Server-side**: Both upload and SoundCloud streaming routes include:
   - Range request validation
   - Stream error handling
   - Client disconnect handling
   - Timeout handling

## License

MIT