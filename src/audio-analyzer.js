/**
 * DJAI Advanced Audio Analyzer
 * Handles detailed analysis of audio files for advanced DJ mixing
 */

const fs = require('fs');
const path = require('path');
const { EssentiaWASM, EssentiaJS } = require('essentia.js');
const Meyda = require('meyda');
const mm = require('music-metadata');
const { AudioContext } = require('web-audio-api');

// Initialize Essentia 
let essentia;

// Cache for analyzed tracks to avoid repeat processing
const analysisCache = new Map();

/**
 * Initialize the audio analyzer
 */
async function initialize() {
  try {
    // Initialize EssentiaJS
    const wasmModule = await EssentiaWASM();
    essentia = new EssentiaJS(wasmModule);
    console.log('Audio analyzer initialized successfully');
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

// Export the API
module.exports = {
  initialize,
  analyzeTrackFile,
  analyzeStream,
  findBestTransition
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