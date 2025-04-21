/**
 * DJAI Advanced Audio Analyzer
 * Handles detailed analysis of audio files for advanced DJ mixing
 * Enhanced with AI-based lyrics detection and LTX prompt generation
 */

const fs = require('fs');
const path = require('path');
const { EssentiaWASM, EssentiaJS } = require('essentia.js');
const Meyda = require('meyda');
const mm = require('music-metadata');
const { AudioContext } = require('web-audio-api');
const fetch = require('node-fetch');
const os = require('os');
const { spawn } = require('child_process');
const lyricsService = require('./lyrics-service');

// Try to import optional AI libraries for lyrics detection
let whisper;
try {
  // For speech-to-text (lyrics detection)
  whisper = require('whisper-node');
} catch (err) {
  console.log('Whisper-node not installed, falling back to alternative methods for lyrics detection');
}

// Initialize Essentia 
let essentia;

// Cache for analyzed tracks to avoid repeat processing
const analysisCache = new Map();

// Cache for lyrics specifically
const lyricsCache = new Map();

// Temp directory for audio processing
const tempDir = path.join(os.tmpdir(), 'djai-analysis');

/**
 * Initialize the audio analyzer
 */
async function initialize() {
  try {
    // Initialize EssentiaJS
    const wasmModule = await EssentiaWASM();
    essentia = new EssentiaJS(wasmModule);
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Initialize Whisper model if available
    let whisperInitialized = false;
    if (whisper) {
      try {
        // Use base model for faster processing but still decent accuracy
        global.whisperModel = new whisper.Whisper('base');
        await global.whisperModel.load();
        whisperInitialized = true;
        console.log('Whisper model initialized for lyrics detection');
      } catch (whisperError) {
        console.error('Error initializing Whisper model:', whisperError);
      }
    }
    
    console.log('Audio analyzer initialized successfully');
    console.log(`Lyrics detection: ${whisperInitialized ? 'AI-enabled' : 'Using external API only'}`);
    return true;
  } catch (error) {
    console.error('Failed to initialize audio analyzer:', error);
    return false;
  }
}

/**
 * Analyze a track file in detail using Essentia.js
 * @param {string} filePath - Path to the audio file
 * @returns {Object} Detailed analysis of the track
 */
async function analyzeTrackFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Check if we have cached analysis for this file
  const cacheKey = `${filePath}-${fs.statSync(filePath).mtimeMs}`;
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey);
  }

  try {
    // Read audio file
    const audioData = fs.readFileSync(filePath);
    
    // Use music-metadata for basic info
    const metadata = await mm.parseBuffer(audioData);
    
    // Set up audio context and buffer for Meyda
    const audioContext = new AudioContext();
    const audioBuffer = await decodeAudioFile(audioData, audioContext);
    
    // Convert buffer to Float32Array for Essentia
    const audioArray = audioBuffer.getChannelData(0);
    
    // Use Essentia for rhythm analysis
    let rhythmAnalysis = {};
    
    if (essentia) {
      // Analyze beat positions and BPM
      const beatTracking = essentia.BeatTrackerMultiFeature(audioArray);
      
      // Analyze key
      const keyExtractor = essentia.KeyExtractor(audioArray, audioContext.sampleRate);
      
      // Detect segments for possible transition points
      const segments = essentia.SBic(audioArray);
      
      rhythmAnalysis = {
        bpm: beatTracking.bpm,
        beats: beatTracking.ticks,
        confidence: beatTracking.confidence,
        key: keyExtractor.key,
        scale: keyExtractor.scale,
        segments: segments.segmentation.map(s => s * audioArray.length),
        energyBands: []
      };
      
      // Add energy bands analysis (for transitions)
      const frameSize = 2048;
      for (let i = 0; i < audioArray.length; i += frameSize) {
        if (i + frameSize < audioArray.length) {
          const frame = audioArray.slice(i, i + frameSize);
          const energyBands = essentia.EnergyBand(frame, audioContext.sampleRate);
          
          rhythmAnalysis.energyBands.push({
            time: i / audioContext.sampleRate,
            lowEnergy: energyBands.lowEnergy,
            midEnergy: energyBands.midEnergy,
            highEnergy: energyBands.highEnergy
          });
        }
      }
    }

    // Compile the results
    const analysis = {
      format: {
        duration: metadata.format.duration,
        sampleRate: metadata.format.sampleRate,
        channels: metadata.format.numberOfChannels
      },
      metadata: {
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album,
        genre: metadata.common.genre
      },
      rhythm: rhythmAnalysis,
      timestamp: Date.now()
    };
    
    // Cache the analysis
    analysisCache.set(cacheKey, analysis);
    console.log(`Analysis completed for: ${path.basename(filePath)}`);
    
    return analysis;
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Analyze a stream from SoundCloud or other source
 * This is a simplified version since we can't fully process the stream
 * @param {Buffer} audioBuffer - Audio buffer data
 * @param {Object} metadata - Track metadata
 * @returns {Object} Analysis result
 */
async function analyzeStream(audioBuffer, metadata) {
  try {
    // Set up audio context
    const audioContext = new AudioContext();
    const decodedBuffer = await decodeAudioFile(audioBuffer, audioContext);
    
    // Extract features using Meyda
    Meyda.bufferSize = 2048;
    const features = Meyda.extract(['energy', 'rms', 'zcr', 'spectralCentroid'], decodedBuffer.getChannelData(0));
    
    // Use energy and spectral features to estimate good transition points
    // This is a simplified approach without full beat analysis
    const transitionPoints = estimateTransitionPoints(features, decodedBuffer.duration);
    
    return {
      format: {
        duration: decodedBuffer.duration,
        sampleRate: decodedBuffer.sampleRate,
        channels: decodedBuffer.numberOfChannels
      },
      metadata: metadata,
      features: features,
      transitionPoints: transitionPoints,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error analyzing stream:', error);
    // Return a minimal analysis result
    return {
      bpm: metadata.bpm || 120,
      duration: metadata.duration || 180000,
      transitionPoint: metadata.duration ? Math.floor(metadata.duration * 0.8) : 140000
    };
  }
}

/**
 * Find the best transition point between two tracks
 * @param {Object} sourceTrack - Source track analysis
 * @param {Object} targetTrack - Target track analysis
 * @returns {Object} Transition information
 */
function findBestTransition(sourceTrack, targetTrack) {
  // Default to 80% if we don't have detailed analysis
  const defaultTransitionPoint = Math.floor(sourceTrack.duration * 0.8);
  
  // If we don't have rhythm analysis, return simple transition
  if (!sourceTrack.rhythm || !sourceTrack.rhythm.beats || 
      !targetTrack.rhythm || !targetTrack.rhythm.beats) {
    return {
      transitionPoint: defaultTransitionPoint,
      sourceBpm: sourceTrack.rhythm?.bpm || 120,
      targetBpm: targetTrack.rhythm?.bpm || 120,
      bpmDifference: ((targetTrack.rhythm?.bpm || 120) - (sourceTrack.rhythm?.bpm || 120)),
      sourceKey: sourceTrack.rhythm?.key || 'C',
      targetKey: targetTrack.rhythm?.key || 'C',
      keyCompatibility: 'unknown',
      type: 'simple'
    };
  }
  
  // Find a good transition point at a phrase boundary (usually multiple of 8, 16, or 32 beats)
  const beats = sourceTrack.rhythm.beats;
  let bestTransitionPoint = defaultTransitionPoint;
  
  // Look for transition points in the last third of the track
  const startSearchAt = Math.floor(beats.length * 0.66);
  
  // Find a point that's likely to be a phrase boundary (multiple of 16 beats)
  // This is a simplified approach - real DJ software analyzes phrase structure
  for (let i = startSearchAt; i < beats.length; i++) {
    if ((i % 16) === 0) { // Look for multiples of 16 beats
      bestTransitionPoint = beats[i];
      break;
    }
  }
  
  // Calculate BPM compatibility
  const bpmDifference = targetTrack.rhythm.bpm - sourceTrack.rhythm.bpm;
  const bpmCompatibility = Math.abs(bpmDifference) < 10 ? 'good' : 
                          Math.abs(bpmDifference) < 20 ? 'moderate' : 'challenging';
  
  // Determine key compatibility based on Camelot wheel / circle of fifths
  const keyCompatibility = analyzeKeyCompatibility(
    sourceTrack.rhythm.key, 
    sourceTrack.rhythm.scale,
    targetTrack.rhythm.key,
    targetTrack.rhythm.scale
  );
  
  // Determine transition type based on BPM and key compatibility
  const transitionType = determineTransitionType(bpmCompatibility, keyCompatibility);
  
  return {
    transitionPoint: bestTransitionPoint,
    sourceBpm: sourceTrack.rhythm.bpm,
    targetBpm: targetTrack.rhythm.bpm,
    bpmDifference: bpmDifference,
    bpmCompatibility: bpmCompatibility,
    sourceKey: sourceTrack.rhythm.key,
    targetKey: targetTrack.rhythm.key,
    keyCompatibility: keyCompatibility,
    type: transitionType
  };
}

/**
 * Determine the best transition type based on BPM and key compatibility
 * @param {string} bpmCompatibility - BPM compatibility rating
 * @param {string} keyCompatibility - Key compatibility rating
 * @returns {string} Transition type
 */
function determineTransitionType(bpmCompatibility, keyCompatibility) {
  if (bpmCompatibility === 'good' && keyCompatibility === 'perfect') {
    return 'beatmatch_blend'; // Perfect for beat matching and blending
  }
  if (bpmCompatibility === 'good') {
    return 'beatmatch_fade'; // Good for beat matching with a smooth fade
  }
  if (keyCompatibility === 'perfect' || keyCompatibility === 'compatible') {
    return 'harmonic_fade'; // Good for harmonic mixing with a fade
  }
  if (bpmCompatibility === 'moderate' && keyCompatibility !== 'clash') {
    return 'tempo_adjust'; // Adjust tempo and fade
  }
  return 'cut_eq'; // Cut with EQ adjustment for challenging transitions
}

/**
 * Analyze key compatibility between two tracks
 * Based on the circle of fifths / Camelot wheel system used by DJs
 * @param {string} sourceKey - Source track key
 * @param {string} sourceScale - Source track scale (major/minor)
 * @param {string} targetKey - Target track key
 * @param {string} targetScale - Target track scale (major/minor)
 * @returns {string} Compatibility rating
 */
function analyzeKeyCompatibility(sourceKey, sourceScale, targetKey, targetScale) {
  // Convert keys to Camelot notation
  const sourceCamelot = keyToCamelot(sourceKey, sourceScale);
  const targetCamelot = keyToCamelot(targetKey, targetScale);
  
  if (!sourceCamelot || !targetCamelot) return 'unknown';
  
  // Extract hour and mode (A=minor, B=major)
  const sourceHour = parseInt(sourceCamelot.substring(0, 2));
  const sourceMode = sourceCamelot.substring(2);
  const targetHour = parseInt(targetCamelot.substring(0, 2));
  const targetMode = targetCamelot.substring(2);
  
  // Same key is perfect
  if (sourceCamelot === targetCamelot) return 'perfect';
  
  // Adjacent hours in same mode are compatible (e.g., 1A to 2A)
  if (sourceMode === targetMode) {
    if (sourceHour === (targetHour % 12) + 1 || targetHour === (sourceHour % 12) + 1) {
      return 'compatible';
    }
  }
  
  // Relative major/minor are compatible (e.g., 1A to 10B)
  if ((sourceMode === 'A' && targetMode === 'B') || (sourceMode === 'B' && targetMode === 'A')) {
    const relativeHour = sourceMode === 'A' ? (sourceHour + 3) % 12 : (sourceHour - 3 + 12) % 12;
    if (relativeHour === 0) relativeHour = 12;
    if (relativeHour === targetHour) return 'compatible';
  }
  
  // Perfect fifth is also good (7 steps clockwise or counterclockwise)
  if (sourceMode === targetMode) {
    if (sourceHour === (targetHour + 7) % 12 || targetHour === (sourceHour + 7) % 12) {
      return 'compatible';
    }
  }
  
  // Opposite key is usually a clash
  if (Math.abs(sourceHour - targetHour) === 6) return 'clash';
  
  // Other combinations are generally moderate
  return 'moderate';
}

/**
 * Convert musical key to Camelot notation (used by DJs)
 * @param {string} key - Musical key (e.g., 'C', 'F#')
 * @param {string} scale - Scale type ('major' or 'minor')
 * @returns {string} Camelot notation (e.g., '08B', '11A')
 */
function keyToCamelot(key, scale) {
  const camelotMap = {
    'C major': '08B', 'G major': '09B', 'D major': '10B', 'A major': '11B', 
    'E major': '12B', 'B major': '01B', 'F# major': '02B', 'C# major': '03B',
    'G# major': '04B', 'D# major': '05B', 'A# major': '06B', 'F major': '07B',
    
    'A minor': '08A', 'E minor': '09A', 'B minor': '10A', 'F# minor': '11A',
    'C# minor': '12A', 'G# minor': '01A', 'D# minor': '02A', 'A# minor': '03A',
    'F minor': '04A', 'C minor': '05A', 'G minor': '06A', 'D minor': '07A',
    
    // Alternative names
    'Db major': '03B', 'Eb major': '05B', 'Gb major': '02B', 'Ab major': '04B', 'Bb major': '06B',
    'Bb minor': '03A', 'Eb minor': '02A', 'Ab minor': '01A', 'Db minor': '04A', 'Gb minor': '11A'
  };
  
  const keyScale = `${key} ${scale.toLowerCase()}`;
  return camelotMap[keyScale] || null;
}

/**
 * Estimate transition points without detailed beat analysis
 * @param {Object} features - Audio features
 * @param {number} duration - Track duration in seconds
 * @returns {Array} Potential transition points in seconds
 */
function estimateTransitionPoints(features, duration) {
  // This is a simplified approach to find energy dips
  // Real systems would use more sophisticated algorithms
  
  // Default points at 25%, 50%, 75% and 80% of the track
  const defaultPoints = [
    duration * 0.25, 
    duration * 0.5, 
    duration * 0.75,
    duration * 0.8
  ];
  
  // Without detailed segmentation, return defaults
  return defaultPoints;
}

/**
 * Helper function to decode audio file
 * @param {Buffer} audioData - Audio file buffer
 * @param {AudioContext} audioContext - Web Audio context
 * @returns {Promise<AudioBuffer>} Decoded audio buffer
 */
function decodeAudioFile(audioData, audioContext) {
  return new Promise((resolve, reject) => {
    audioContext.decodeAudioData(audioData, resolve, reject);
  });
}

/**
 * Detect lyrics directly from an audio file using Whisper model
 * @param {string} audioPath - Path to the audio file
 * @param {Object} trackData - Additional track metadata
 * @returns {Promise<Object>} Detected lyrics with timing information
 */
async function detectLyrics(audioPath, trackData = {}) {
  try {
    console.log(`Detecting lyrics from ${audioPath}`);
    
    // Generate a unique ID for this track
    const trackId = trackData.id || `track-${path.basename(audioPath)}`;
    
    // Check cache first
    const cachedLyrics = lyricsCache.get(trackId);
    if (cachedLyrics) {
      console.log(`Returning cached lyrics for track ${trackId}`);
      return cachedLyrics;
    }
    
    let detectedLyrics = '';
    let timingData = null;
    let source = 'none';
    
    // First attempt: Look up lyrics by track info if we have it
    if (trackData.title) {
      try {
        const trackInfo = lyricsService.extractTrackInfo(trackData);
        console.log(`Looking up lyrics for: ${trackInfo.artist} - ${trackInfo.title}`);
        const lookupLyrics = await lyricsService.getLyrics(trackInfo.artist, trackInfo.title);
        
        if (lookupLyrics && !lookupLyrics.includes('[No lyrics found')) {
          console.log('Found lyrics through lookup API');
          detectedLyrics = lookupLyrics;
          source = 'api';
        }
      } catch (lookupError) {
        console.error('Error looking up lyrics:', lookupError);
      }
    }
    
    // Second attempt: Use Whisper model for transcription if available
    if ((!detectedLyrics || detectedLyrics.length < 50) && global.whisperModel) {
      try {
        console.log('Attempting to detect lyrics with Whisper model');
        
        // Transcribe audio
        const result = await global.whisperModel.transcribe(audioPath, {
          language: 'en',  // or 'auto' for language detection
          word_timestamps: true  // get timing for each word
        });
        
        if (result && result.text) {
          // Process the transcription into lyrics format
          detectedLyrics = formatTranscriptionAsLyrics(result.text);
          
          // Extract timing data if available
          if (result.segments) {
            timingData = result.segments.map(segment => ({
              start: segment.start * 1000, // convert to ms
              end: segment.end * 1000,
              text: segment.text
            }));
          }
          
          source = 'whisper';
          console.log('Successfully detected lyrics with Whisper model');
        }
      } catch (whisperError) {
        console.error('Error detecting lyrics with Whisper:', whisperError);
      }
    }
    
    // Third attempt: Try with FFmpeg as a fallback
    if (!detectedLyrics || detectedLyrics.length < 50) {
      try {
        const ffmpegLyrics = await detectLyricsWithFFmpeg(audioPath);
        if (ffmpegLyrics && ffmpegLyrics.length > 50) {
          detectedLyrics = ffmpegLyrics;
          source = 'ffmpeg';
        }
      } catch (ffmpegError) {
        console.error('Error detecting lyrics with FFmpeg:', ffmpegError);
      }
    }
    
    // Fallback: Generate placeholder lyrics
    if (!detectedLyrics || detectedLyrics.length < 50) {
      if (trackData.title) {
        const trackInfo = lyricsService.extractTrackInfo(trackData);
        detectedLyrics = await lyricsService.generateFakeLyrics(trackInfo.artist, trackInfo.title);
        source = 'generated';
      } else {
        detectedLyrics = 'No lyrics detected for this track.';
        source = 'none';
      }
    }
    
    // Cache the results
    const result = {
      text: detectedLyrics,
      timing: timingData,
      source: source
    };
    
    lyricsCache.set(trackId, result);
    return result;
  } catch (error) {
    console.error('Error detecting lyrics:', error);
    return {
      text: 'Error detecting lyrics.',
      timing: null,
      source: 'error'
    };
  }
}

/**
 * Detect lyrics using FFmpeg with speech recognition
 * This is a fallback method when Whisper is not available
 * @param {string} audioPath - Path to the audio file
 * @returns {Promise<string>} Detected lyrics text
 */
async function detectLyricsWithFFmpeg(audioPath) {
  return new Promise((resolve, reject) => {
    // This is a placeholder - in a real implementation, 
    // you'd use FFmpeg with a speech recognition API
    // For now, return empty string so we fall back to API or generated lyrics
    resolve('');
  });
}

/**
 * Format raw transcription into lyrics format
 * @param {string} transcription - Raw transcription text
 * @returns {string} - Formatted lyrics
 */
function formatTranscriptionAsLyrics(transcription) {
  if (!transcription) return '';
  
  // Basic formatting - split into lines at punctuation
  let formatted = transcription
    .replace(/\./g, '.\n')
    .replace(/\?/g, '?\n')
    .replace(/!/g, '!\n')
    .replace(/;/g, ';\n');
  
  // Attempt to identify chorus by repeating phrases
  const lines = formatted.split('\n');
  const lineFrequency = {};
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length > 10) { // Only consider substantial lines
      lineFrequency[trimmed] = (lineFrequency[trimmed] || 0) + 1;
    }
  });
  
  // Identify potential chorus lines (repeated 2+ times)
  const chorusLines = Object.entries(lineFrequency)
    .filter(([line, count]) => count >= 2)
    .map(([line]) => line);
  
  // Mark chorus sections
  if (chorusLines.length > 0) {
    let inChorus = false;
    let newLines = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Detect start of chorus
      if (!inChorus && chorusLines.some(cl => trimmed.includes(cl))) {
        newLines.push('[Chorus]');
        inChorus = true;
      } 
      // Detect end of chorus
      else if (inChorus && !chorusLines.some(cl => trimmed.includes(cl)) && trimmed.length > 10) {
        newLines.push('[Verse]');
        inChorus = false;
      }
      
      newLines.push(line);
    });
    
    formatted = newLines.join('\n');
  }
  
  // Add verse marker at beginning if no sections detected
  if (!formatted.includes('[Verse]') && !formatted.includes('[Chorus]')) {
    formatted = '[Verse]\n' + formatted;
  }
  
  return formatted;
}

/**
 * Create an LTX prompt from a segment and audio features
 * @param {string} text - Segment text (lyrics)
 * @param {Object} features - Audio features for this segment
 * @returns {string} - LTX prompt
 */
function createLTXPromptFromSegment(text, features) {
  // Use the lyricsBufferService methods to analyze and create prompts
  const lyricsBufferService = require('./lyrics-buffer-service');
  
  // Analyze emotional tone
  const emotion = lyricsBufferService.analyzeEmotionalTone(text);
  const keywords = lyricsBufferService.extractKeywords(text);
  const style = lyricsBufferService.determineStyleFromLyrics(text);
  
  // Get audio feature descriptions
  const energyLevel = features.energy > 0.7 ? 'high-energy' : 
                      (features.energy < 0.4 ? 'ambient' : 'moderate');
  
  const bpm = features.bpm || 120;
  
  // Build the prompt
  let prompt = `${emotion} ${energyLevel} visualization at ${bpm} BPM`;
  
  // Add lyrics if available
  if (text && text.length > 0 && !text.includes('No lyrics')) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    // Get a representative line (not too long, not too short)
    const sortedLines = [...lines].sort((a, b) => 
      Math.abs(15 - a.length) - Math.abs(15 - b.length)
    );
    const mainLine = sortedLines[0] || lines[0] || text;
    
    prompt += ` with lyrics: "${mainLine}"`;
  }
  
  // Add keywords for stronger visual theming
  if (keywords.length > 0) {
    prompt += `, featuring ${keywords.slice(0, 3).join(', ')}`;
  }
  
  // Add style information
  prompt += `, in ${style} style`;
  
  // Add frequency information if available
  if (features.energyBands && features.energyBands.length > 0) {
    const avgBands = features.energyBands.reduce(
      (acc, band) => {
        acc.low += band.lowEnergy;
        acc.mid += band.midEnergy;
        acc.high += band.highEnergy;
        return acc;
      }, 
      { low: 0, mid: 0, high: 0 }
    );
    
    const count = features.energyBands.length;
    avgBands.low /= count;
    avgBands.mid /= count;
    avgBands.high /= count;
    
    if (avgBands.low > 0.7) {
      prompt += ', with strong bass visualization';
    }
    if (avgBands.high > 0.7) {
      prompt += ', with bright high frequency visuals';
    }
  }
  
  return prompt;
}

/**
 * Generate LTX prompts for a track with segmented lyrics
 * @param {string} audioPath - Path to the audio file
 * @param {Object} trackData - Track metadata
 * @returns {Promise<Array>} Array of LTX prompts with timing info
 */
async function generateLTXPrompts(audioPath, trackData = {}) {
  try {
    // First, analyze the track
    const analysis = await analyzeTrackFile(audioPath);
    
    // Then, get the lyrics
    const lyrics = await detectLyrics(audioPath, trackData);
    
    // Calculate segment duration
    const duration = analysis.format.duration * 1000; // convert to ms
    const lyricsBufferService = require('./lyrics-buffer-service');
    
    // Segment the lyrics
    let segments;
    
    // If we have timing data from Whisper, use it
    if (lyrics.timing && lyrics.timing.length > 0) {
      segments = lyrics.timing.map(segment => ({
        lines: [segment.text],
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        duration: segment.end - segment.start,
        progress: segment.start / duration
      }));
    } else {
      // Otherwise use the buffer service to segment lyrics
      segments = lyricsBufferService.segmentLyrics(lyrics.text, duration);
    }
    
    // Create LTX prompts for each segment
    const prompts = segments.map(segment => {
      // Find audio features for this segment based on time
      // For simplicity, we'll use a basic approach to map segment to audio features
      const segmentProgress = segment.startTime / duration;
      
      // Use rhythm analysis if available
      let segmentFeatures = {
        bpm: analysis.rhythm?.bpm || 120,
        key: analysis.rhythm?.key || 'C',
        scale: analysis.rhythm?.scale || 'major',
        energy: 0.5
      };
      
      // Add energy bands if available
      if (analysis.rhythm && analysis.rhythm.energyBands) {
        const bandIndex = Math.floor(segmentProgress * analysis.rhythm.energyBands.length);
        if (bandIndex < analysis.rhythm.energyBands.length) {
          segmentFeatures.energyBands = [analysis.rhythm.energyBands[bandIndex]];
        }
      }
      
      // Create the prompt
      const prompt = createLTXPromptFromSegment(segment.text, segmentFeatures);
      
      return {
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        prompt: prompt,
        audioFeatures: {
          bpm: segmentFeatures.bpm,
          energy: segmentFeatures.energy,
          key: segmentFeatures.key,
          scale: segmentFeatures.scale
        }
      };
    });
    
    return prompts;
  } catch (error) {
    console.error('Error generating LTX prompts:', error);
    return [];
  }
}

// Export the API
module.exports = {
  initialize,
  analyzeTrackFile,
  analyzeStream,
  findBestTransition,
  detectLyrics,
  generateLTXPrompts
};

// If this script is run directly, initialize and provide CLI functionality
if (require.main === module) {
  (async () => {
    try {
      await initialize();
      
      // Parse command line arguments
      const args = process.argv.slice(2);
      if (args.length < 1) {
        console.log('Usage: node audio-analyzer.js <audio-file-path>');
        process.exit(1);
      }
      
      const filePath = args[0];
      console.log(`Analyzing file: ${filePath}`);
      
      const analysis = await analyzeTrackFile(filePath);
      console.log(JSON.stringify(analysis, null, 2));
      
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}