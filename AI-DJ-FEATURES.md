# DJAI - Advanced Features Documentation

## AI-Powered Lyrics Detection and Visualization

DJAI now includes an advanced AI system for audio analysis, lyrics detection, and visualizations. This document explains how these features work and how to configure them.

### Overview

The system now has the ability to:

1. **Detect lyrics directly from audio files** using speech recognition AI models
2. **Extract audio features** for better visualization effects 
3. **Create AI-powered LTX prompts** for generating creative, diverse video content
4. **Time-align lyrics** with the music
5. **Generate multiple creative interpretations** of lyrics for varied visuals

### How It Works

#### Audio Analysis & Lyrics Detection

The system uses a multi-layered approach to obtain and synchronize lyrics:

1. **First Attempt: External API**
   - Tries to find lyrics using external API services based on track title/artist
   - Fast but may not always have lyrics for all songs

2. **Second Attempt: AI Speech Recognition**
   - If lyrics aren't found via API, the system uses Whisper AI model to transcribe vocals from the audio
   - Includes timing data for each phrase, allowing for perfect sync with the music
   - Requires the optional AI dependencies to be installed

3. **Final Attempt: Generated Placeholder**
   - If all else fails, creates placeholder lyrics based on track metadata
   - Ensures that visualizations always have some content to work with

#### LTX Prompt Generation

LTX (Latent Transformer for XL) prompts are generated to create visual content for each lyric segment:

1. **Audio Feature Analysis**
   - Extracts BPM, key, energy levels, and frequency bands
   - Uses these features to inform the visual style and movement

2. **Lyric Content Analysis**
   - Analyzes sentiment and emotional tone of lyrics
   - Extracts key themes and visual keywords
   - Determines appropriate visual style based on lyrics content
   - Uses AI-driven prompt generation to create varied and creative interpretations
   - Creates multiple thematic visual concepts from the same lyrics

3. **Time-Based Segmentation**
   - Divides lyrics into timed segments
   - When AI transcription is used, segments match exactly to the vocal timing
   - Otherwise, uses smart algorithms to estimate appropriate timing

### Setup

#### Installing Optional AI Components

The AI-powered features require additional dependencies:

```bash
# Install the AI dependencies
npm run install-ai
```

This will install:
- `whisper-node`: For speech-to-text lyrics detection
- `@tensorflow/tfjs-node`: For advanced audio feature extraction

#### Configuration

You can configure the AI systems in the `.env` file:

```env
# AI Configuration
HUGGING_FACE_API_KEY=your_key_here     # For video generation
ENABLE_WHISPER_LYRICS=true             # Enable/disable AI lyrics detection
LYRICS_BUFFER_SIZE=5                   # Number of pre-generated segments
```

### Technical Implementation

The AI lyrics system is implemented across several components:

1. **`audio-analyzer.js`**
   - Core module for audio analysis and lyrics detection
   - Handles AI model initialization and audio feature extraction
   - Includes the Whisper integration for lyrics transcription

2. **`lyrics-buffer-service.js`**
   - Manages pre-generation of video segments
   - Converts lyrics to LTX prompts
   - Handles timing alignment with the music

3. **`lyrics-service.js`**
   - Provides lyrics lookups from external APIs
   - Cleans and formats lyrics for display
   - Serves as fallback when AI detection isn't available

4. **`vj-api-routes.js`**
   - API endpoints for requesting lyrics and video generations
   - Coordinates between client and server-side processing

### Performance Considerations

The AI detection features are resource-intensive:

- **Memory Usage**: The Whisper model requires approximately 1GB of RAM
- **CPU Usage**: Transcription can spike CPU usage temporarily
- **Disk Space**: Pre-generated videos require storage space

For optimal performance on lower-end systems, you may want to disable AI lyrics detection and rely on the API method.

### Custom LTX Prompts with Lightricks/LTX-Video

The system now supports user-defined prompts for video generation:

1. **Custom Prompt Input**: Users can enter their own creative prompts for generating visuals
2. **Lyrics-Enhanced Prompts**: Even with custom prompts, detected lyrics are still available for context
3. **AI-Generated Fallbacks**: The system still generates smart prompts if no custom prompt is provided
4. **Real-time Generation**: Custom prompts are processed immediately for instant visual changes

To use this feature:
- Enter your creative prompt in the "Custom Visual Prompt" input field
- Click "Apply Prompt" or press Enter
- The system will generate a new visualization based on your prompt
- The visualization will still sync with audio features and tempo

The system uses Lightricks/LTX-Video, a high-quality DiT-based video generation model that creates 24 FPS videos with superior visual quality. It works best with detailed, descriptive prompts.

Examples of effective prompts for Lightricks/LTX-Video:
- "The turquoise waves crash against the dark, jagged rocks of the shore, sending white foam spraying into the air at 120 BPM"
- "Abstract liquid particles in vibrant magenta and cyan colors flowing and reacting to bass drops in slow motion"
- "Kaleidoscopic fractals expanding with each beat in shades of blue and purple against a starry night background"
- "A neon cityscape with towering skyscrapers and flying cars, illuminated by colorful holographic billboards that pulse with the beat"

### Claude-Powered AI Prompt Generation

A key new feature is the Claude-powered prompt generation system that creates rich, varied prompts from detected lyrics:

#### How Claude AI Prompt Generation Works:

1. **Lyrics Analysis**: 
   - Extracts meaningful keywords from lyrics text
   - Identifies emotional tone and themes
   - Determines appropriate visual styles
   - Sends this structured information to Claude

2. **Claude API Integration**:
   - Uses the Claude 3 Haiku model via direct API integration
   - Leverages Claude's creative intelligence to craft prompts
   - Provides Claude with detailed context about the music and lyrics
   - Receives optimized prompts tailored for Lightricks/LTX-Video

3. **Audio-Aware Prompt Generation**:
   - Includes BPM, energy levels, and frequency profiles in prompts
   - Creates descriptions that match the rhythm and mood of the music
   - Adapts visual descriptions to match audio characteristics
   - Ensures visual elements synchronize well with the music

4. **Contextual Enhancement**:
   - Adds appropriate musical genre influence
   - Includes relevant stylistic elements
   - Balances literal lyric representation with abstract interpretation
   - Creates visually rich, detailed descriptions

5. **Example Claude-Generated Prompts**:
   - From lyrics like "The stars are falling, I'm calling your name"
   - Claude might generate: "Luminous stars cascade through a cosmic void, dissolving into shimmering particles that form ethereal silhouettes reaching toward each other. The scene pulses at 110 BPM with melancholic blue wavelengths rippling outward with each beat, creating a haunting visual echo of distant voices calling across space."

#### Benefits:

- Generates more creative and varied visual concepts than direct keyword mapping
- Produces multiple distinct interpretations of the same lyrics for visual variety
- Creates rich, detailed prompts that better leverage LTX-Video's capabilities
- Adapts to different music genres and emotional tones

### Future Enhancements

Planned enhancements for the AI lyrics system:

1. **Beat-Precise Lyrics Timing**: Further refine the timing to align perfectly with beats
2. **Voice Isolation**: Apply voice isolation to improve lyrics detection accuracy
3. **Multi-Language Support**: Expand beyond English for international music
4. **Custom Training**: Provide a system to fine-tune the models on specific music genres
5. **Emotion-Driven Visuals**: Enhanced emotional content analysis for better visual matching
6. **Prompt Library**: Save and reuse successful custom prompts for different songs
7. **Claude API Integration**: ✅ Successfully integrated with Claude 3 Haiku API for advanced prompt generation
8. **User Feedback Loop**: Learn from which generated prompts create the best visuals

### Troubleshooting

Common issues:

1. **Lyrics Not Detected**:
   - Ensure the track has clear vocals
   - Check that whisper-node is properly installed
   - Try increasing the sensitivity settings

2. **Incorrect Lyrics**:
   - This is common with certain musical styles or accents
   - Edit the timing data manually if needed
   - Use the API method as backup

3. **High Resource Usage**:
   - Reduce buffer size to process fewer segments at once
   - Use smaller AI model sizes
   - Disable AI detection on lower-end systems