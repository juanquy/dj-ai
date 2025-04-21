/**
 * DJAI Mixer Module
 * Handles track analysis and AI-based mixing functionality
 */

const path = require('path');
const fs = require('fs');
const audioAnalyzer = require('./audio-analyzer');

// Initialize the audio analyzer
let analyzerInitialized = false;
async function ensureAnalyzerInitialized() {
  if (!analyzerInitialized) {
    analyzerInitialized = await audioAnalyzer.initialize();
  }
  return analyzerInitialized;
}

/**
 * Analyze tracks with advanced audio features
 * @param {Array} tracks - Track data
 * @param {Object} SC - SoundCloud API client
 * @return {Promise<Array>} Analyzed tracks with features
 */
async function analyzeTracks(tracks, SC) {
  await ensureAnalyzerInitialized();
  
  return Promise.all(tracks.map(async (track) => {
    try {
      // Get additional track info from SoundCloud API if not already available
      let trackInfo = track;
      let advancedAnalysis = null;
      
      if (!track.bpm && track.id) {
        // Make a request to get complete track info if BPM is not available
        trackInfo = await new Promise((resolve, reject) => {
          SC.get(`/tracks/${track.id}`, (err, detailedTrack) => {
            if (err) {
              console.error(`Error fetching track details for ${track.id}:`, err);
              // Use the original track info but add a placeholder BPM
              resolve({
                ...track,
                bpm: 120, // Default BPM
                analyzed: false
              });
            } else {
              resolve({
                ...detailedTrack,
                analyzed: true
              });
            }
          });
        });
      }
      
      // Check if this is an uploaded track that we can analyze in detail
      if (track.uploaded && track.filePath && fs.existsSync(track.filePath)) {
        try {
          console.log(`Performing advanced analysis on uploaded track: ${track.title}`);
          advancedAnalysis = await audioAnalyzer.analyzeTrackFile(track.filePath);
        } catch (analyzeError) {
          console.error(`Error during advanced analysis of ${track.title}:`, analyzeError);
        }
      }
      
      // Return track with advanced analysis if available
      return {
        ...trackInfo,
        advancedAnalysis,
        analyzed: trackInfo.analyzed || !!advancedAnalysis
      };
    } catch (error) {
      console.error(`Error analyzing track ${track.id}:`, error);
      return {
        ...track,
        bpm: track.bpm || 120, // Use existing BPM or default
        analyzed: false
      };
    }
  }));
}

/**
 * Calculate the optimal mix order for tracks
 * 
 * This implements multiple strategies:
 * 1. Energy curve - builds energy up and then down
 * 2. BPM matching - minimizes BPM jumps
 * 3. Key compatibility - follows harmonic mixing principles
 * 
 * @param {Array} analyzedTracks - Tracks with analysis data
 * @return {Array} Optimally ordered tracks
 */
function calculateMixOrder(analyzedTracks) {
  // If we have fewer than 3 tracks, just sort by BPM
  if (analyzedTracks.length < 3) {
    return [...analyzedTracks].sort((a, b) => {
      const aBpm = a.bpm || 120;
      const bBpm = b.bpm || 120;
      return aBpm - bBpm;
    });
  }
  
  // Check if we have advanced analysis for key matching
  const hasAdvancedAnalysis = analyzedTracks.some(t => t.advancedAnalysis);
  
  // Create track scoring system based on multiple factors
  const tracks = [...analyzedTracks].map(track => ({
    ...track,
    // Energy score (1-10) - estimate from features if available
    energy: estimateTrackEnergy(track),
    // Use actual BPM or default to 120
    bpm: track.bpm || 120,
    // Extract key if available from advanced analysis
    key: track.advancedAnalysis?.rhythm?.key || 'C',
    scale: track.advancedAnalysis?.rhythm?.scale || 'major'
  }));
  
  // Different ordering strategies:
  
  // 1. Energy curve - start medium, build up, then come down
  const energyOrdered = createEnergyCurve(tracks);
  
  // 2. BPM matching - minimize BPM jumps
  const bpmOrdered = minimizeBpmJumps(tracks);
  
  // 3. If we have key data, try harmonic mixing
  let harmonicOrdered = tracks;
  if (hasAdvancedAnalysis) {
    harmonicOrdered = harmonicMixing(tracks);
  }
  
  // Combine the strategies with weighted scoring
  const finalOrder = [...tracks]; // Copy tracks to start
  
  // Score each possible position for each track
  const scores = {};
  
  tracks.forEach(track => {
    scores[track.id] = Array(tracks.length).fill(0);
    
    // Apply scores from each ordering strategy
    energyOrdered.forEach((t, idx) => {
      if (t.id === track.id) {
        // Highest score in the middle positions
        scores[track.id][idx] += 5;
      }
    });
    
    bpmOrdered.forEach((t, idx) => {
      if (t.id === track.id) {
        // Highest BPM score for BPM-optimal positions
        scores[track.id][idx] += 10;
      }
    });
    
    if (hasAdvancedAnalysis) {
      harmonicOrdered.forEach((t, idx) => {
        if (t.id === track.id) {
          // Key-matching is important but slightly less than BPM
          scores[track.id][idx] += 8;
        }
      });
    }
  });
  
  // Use a greedy algorithm to place tracks based on scores
  const result = [];
  const usedTracks = new Set();
  
  for (let position = 0; position < tracks.length; position++) {
    // Find the track with highest score for this position
    let bestScore = -1;
    let bestTrack = null;
    
    tracks.forEach(track => {
      if (!usedTracks.has(track.id) && scores[track.id][position] > bestScore) {
        bestScore = scores[track.id][position];
        bestTrack = track;
      }
    });
    
    if (bestTrack) {
      result.push(bestTrack);
      usedTracks.add(bestTrack.id);
    }
  }
  
  // Add any remaining tracks (shouldn't happen but just in case)
  tracks.forEach(track => {
    if (!usedTracks.has(track.id)) {
      result.push(track);
    }
  });
  
  return result;
}

/**
 * Estimate track energy level (1-10) from available features
 * @param {Object} track - Track data
 * @return {number} Energy score 1-10
 */
function estimateTrackEnergy(track) {
  // If we have advanced analysis, use it
  if (track.advancedAnalysis?.rhythm?.energyBands?.length > 0) {
    // Calculate average energy from the energy bands
    const bands = track.advancedAnalysis.rhythm.energyBands;
    const avgEnergy = bands.reduce((sum, band) => {
      return sum + (band.lowEnergy + band.midEnergy + band.highEnergy) / 3;
    }, 0) / bands.length;
    
    // Scale to 1-10
    return Math.max(1, Math.min(10, Math.floor(avgEnergy * 10)));
  }
  
  // Otherwise use BPM as a rough proxy for energy
  // The faster the BPM, the higher the energy (generally)
  if (track.bpm) {
    if (track.bpm < 80) return 2;
    if (track.bpm < 100) return 4;
    if (track.bpm < 120) return 6;
    if (track.bpm < 140) return 8;
    return 10;
  }
  
  // Default energy level
  return 5;
}

/**
 * Create an energy curve for a dynamic DJ set
 * @param {Array} tracks - Tracks with energy scores
 * @return {Array} Tracks ordered by desired energy curve
 */
function createEnergyCurve(tracks) {
  // Sort by energy level
  const sortedByEnergy = [...tracks].sort((a, b) => a.energy - b.energy);
  
  // Create a curve that starts in the middle, builds up, then comes down
  const result = [];
  const midpoint = Math.floor(sortedByEnergy.length / 2);
  
  // Start with a middle energy track
  result.push(sortedByEnergy[midpoint]);
  
  // Gradually increase energy, then decrease
  let upIndex = midpoint + 1;
  let downIndex = midpoint - 1;
  let goingUp = true;
  
  while (result.length < tracks.length) {
    if (goingUp && upIndex < sortedByEnergy.length) {
      result.push(sortedByEnergy[upIndex]);
      upIndex++;
    } else if (downIndex >= 0) {
      result.push(sortedByEnergy[downIndex]);
      downIndex--;
    } else if (upIndex < sortedByEnergy.length) {
      // Fallback in case we don't have enough lower energy tracks
      result.push(sortedByEnergy[upIndex]);
      upIndex++;
    }
    
    // Switch direction after we've gone up for a while
    if (goingUp && result.length > tracks.length * 0.7) {
      goingUp = false;
    }
  }
  
  return result;
}

/**
 * Order tracks to minimize BPM jumps between consecutive tracks
 * @param {Array} tracks - Tracks with BPM values
 * @return {Array} Tracks ordered to minimize BPM changes
 */
function minimizeBpmJumps(tracks) {
  // Start with the track with lowest BPM
  const sortedByBpm = [...tracks].sort((a, b) => a.bpm - b.bpm);
  const result = [sortedByBpm[0]];
  const remaining = sortedByBpm.slice(1);
  
  // Add tracks one by one, always choosing the one with closest BPM
  while (remaining.length > 0) {
    const lastTrack = result[result.length - 1];
    let bestMatch = 0;
    let bestDiff = Infinity;
    
    remaining.forEach((track, index) => {
      const diff = Math.abs(track.bpm - lastTrack.bpm);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = index;
      }
    });
    
    result.push(remaining[bestMatch]);
    remaining.splice(bestMatch, 1);
  }
  
  return result;
}

/**
 * Order tracks based on harmonic mixing principles (Camelot wheel)
 * @param {Array} tracks - Tracks with key information
 * @return {Array} Tracks ordered for harmonic transitions
 */
function harmonicMixing(tracks) {
  // Filter tracks with valid key data
  const tracksWithKeys = tracks.filter(t => t.key && t.scale);
  
  // If we don't have enough tracks with keys, return original
  if (tracksWithKeys.length < tracks.length * 0.5) {
    return tracks;
  }
  
  // Start with a random track
  const result = [tracksWithKeys[0]];
  const remaining = tracksWithKeys.slice(1);
  
  // Add tracks one by one, always choosing the one with best harmonic match
  while (remaining.length > 0) {
    const lastTrack = result[result.length - 1];
    let bestMatch = 0;
    let bestScore = -1;
    
    remaining.forEach((track, index) => {
      // Score harmonically compatible keys higher
      const keyMatch = scoreKeyCompatibility(lastTrack.key, lastTrack.scale, track.key, track.scale);
      // Also consider BPM for a combined score
      const bpmDiff = Math.abs(track.bpm - lastTrack.bpm);
      const bpmScore = 10 - Math.min(10, bpmDiff / 5);
      
      // Combined score (key match is more important)
      const score = keyMatch * 2 + bpmScore;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = index;
      }
    });
    
    result.push(remaining[bestMatch]);
    remaining.splice(bestMatch, 1);
  }
  
  // Add any tracks that didn't have keys at the end
  const missingTracks = tracks.filter(t => !t.key || !t.scale);
  return [...result, ...missingTracks];
}

/**
 * Score key compatibility between two tracks (0-10)
 * @param {string} key1 - First track's key
 * @param {string} scale1 - First track's scale
 * @param {string} key2 - Second track's key
 * @param {string} scale2 - Second track's scale
 * @return {number} Compatibility score (0-10)
 */
function scoreKeyCompatibility(key1, scale1, key2, scale2) {
  // Same key is perfect
  if (key1 === key2 && scale1 === scale2) return 10;
  
  // We'll use a simplified version of the Camelot wheel
  const camelotWheel = {
    'C major': 8, 'G major': 9, 'D major': 10, 'A major': 11, 
    'E major': 12, 'B major': 1, 'F# major': 2, 'C# major': 3,
    'G# major': 4, 'D# major': 5, 'A# major': 6, 'F major': 7,
    
    'A minor': 8, 'E minor': 9, 'B minor': 10, 'F# minor': 11,
    'C# minor': 12, 'G# minor': 1, 'D# minor': 2, 'A# minor': 3,
    'F minor': 4, 'C minor': 5, 'G minor': 6, 'D minor': 7,
    
    // Alternate names
    'Db major': 3, 'Eb major': 5, 'Gb major': 2, 'Ab major': 4, 'Bb major': 6,
    'Bb minor': 3, 'Eb minor': 2, 'Ab minor': 1, 'Db minor': 4, 'Gb minor': 11
  };
  
  const mode1 = scale1.toLowerCase() === 'minor' ? 'minor' : 'major';
  const mode2 = scale2.toLowerCase() === 'minor' ? 'minor' : 'major';
  
  const key1Pos = camelotWheel[`${key1} ${mode1}`];
  const key2Pos = camelotWheel[`${key2} ${mode2}`];
  
  // If we can't find the keys in our wheel, assume moderate compatibility
  if (!key1Pos || !key2Pos) return 5;
  
  // Calculate distance in the wheel (0-6 steps)
  let distance = Math.abs(key1Pos - key2Pos);
  if (distance > 6) distance = 12 - distance;
  
  // Adjacent keys (1 step) are very compatible
  if (distance === 1) return 9;
  
  // Relative major/minor (3 steps) are very compatible
  if (distance === 3 && mode1 !== mode2) return 9;
  
  // Perfect fifth (7 steps around) is pretty compatible
  if (distance === 7) return 8;
  
  // Same mode but different keys - compatibility decreases with distance
  if (mode1 === mode2) {
    return 10 - distance;
  }
  
  // Different modes - generally less compatible
  return 6 - distance;
}

/**
 * Generate intelligent transition points between tracks
 * 
 * This improved version:
 * 1. Uses beat positions for more precise transitions
 * 2. Determines transition types (beatmatch, harmonic, etc.)
 * 3. Calculates appropriate transition durations based on BPM difference
 * 
 * @param {Array} orderedTracks - Tracks in the optimal play order
 * @return {Array} Enhanced transition data
 */
function generateTransitionPoints(orderedTracks) {
  const transitions = [];
  
  for (let i = 0; i < orderedTracks.length - 1; i++) {
    const currentTrack = orderedTracks[i];
    const nextTrack = orderedTracks[i + 1];
    
    // Calculate duration in milliseconds
    const currentDuration = currentTrack.duration || 180000; // Default to 3 min if not available
    
    // Check if we can use advanced analysis
    let transitionInfo = null;
    
    if (currentTrack.advancedAnalysis && nextTrack.advancedAnalysis) {
      // Use the audio analyzer to find the optimal transition
      transitionInfo = audioAnalyzer.findBestTransition(
        currentTrack.advancedAnalysis, 
        nextTrack.advancedAnalysis
      );
    }
    
    // If we don't have advanced analysis, use a fallback approach
    if (!transitionInfo) {
      // Calculate BPM difference
      const currentBpm = currentTrack.bpm || 120;
      const nextBpm = nextTrack.bpm || 120;
      const bpmDiff = nextBpm - currentBpm;
      
      // Set transition point at around 80% of the track by default
      let transitionPoint = Math.floor(currentDuration * 0.8);
      
      // Adjust for larger BPM differences (longer transitions for bigger jumps)
      let transitionDuration = 8000; // 8 seconds by default
      let transitionType = 'fade';
      
      if (Math.abs(bpmDiff) < 5) {
        // Very close BPMs - shorter transition
        transitionDuration = 6000;
        transitionType = 'beatmatch';
      } else if (Math.abs(bpmDiff) > 15) {
        // Larger BPM difference - longer transition
        transitionDuration = 12000;
        transitionType = 'long_fade';
      }
      
      transitionInfo = {
        transitionPoint,
        sourceBpm: currentBpm,
        targetBpm: nextBpm,
        bpmDifference: bpmDiff,
        type: transitionType,
        duration: transitionDuration
      };
    }
    
    transitions.push({
      fromTrack: currentTrack.id,
      toTrack: nextTrack.id,
      transitionPoint: transitionInfo.transitionPoint,
      bpmDifference: transitionInfo.bpmDifference,
      sourceKey: transitionInfo.sourceKey,
      targetKey: transitionInfo.targetKey,
      keyCompatibility: transitionInfo.keyCompatibility,
      transitionType: transitionInfo.type,
      transitionDuration: transitionInfo.duration || 8000 // Default to 8 seconds if not specified
    });
  }
  
  return transitions;
}

/**
 * Generate a complete mix playlist with enhanced transition info
 * @param {Array} trackIds - IDs of tracks to mix
 * @param {Object} SC - SoundCloud API client
 * @return {Promise<Object>} Mix data
 */
async function generateMix(trackIds, SC) {
  try {
    // Initialize audio analyzer
    await ensureAnalyzerInitialized();
    
    // Fetch track details for all IDs
    const trackDetails = await Promise.all(trackIds.map(id => {
      return new Promise((resolve, reject) => {
        SC.get(`/tracks/${id}`, (err, track) => {
          if (err) {
            console.error(`Error fetching track ${id}:`, err);
            reject(err);
          } else {
            resolve(track);
          }
        });
      });
    }));
    
    // Analyze tracks to get BPM and other audio features
    const analyzedTracks = await analyzeTracks(trackDetails, SC);
    
    // Calculate the best mix order
    const orderedTracks = calculateMixOrder(analyzedTracks);
    
    // Generate enhanced transition points
    const transitions = generateTransitionPoints(orderedTracks);
    
    return {
      tracks: orderedTracks,
      transitions,
      totalDuration: orderedTracks.reduce((total, track) => total + (track.duration || 180000), 0),
      hasAdvancedAnalysis: analyzedTracks.some(t => t.advancedAnalysis)
    };
  } catch (error) {
    console.error('Error generating mix:', error);
    throw error;
  }
}

module.exports = {
  analyzeTracks,
  calculateMixOrder,
  generateTransitionPoints,
  generateMix
};