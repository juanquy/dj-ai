/**
 * DJAI Lyrics Buffer Service
 * Manages a buffer of pre-generated video clips based on lyric segments
 * for real-time mixing and visualization
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const lyricsService = require('./lyrics-service');

class LyricsBufferService {
  constructor() {
    this.videoBuffer = new Map();
    this.generationQueue = [];
    this.isProcessingQueue = false;
    this.cacheDir = path.join(process.cwd(), 'public', 'videos', 'lyric-segments');
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // Configure buffer size (how many segments to pre-generate)
    this.LOOKAHEAD_SEGMENTS = 3;
    this.MAX_CONCURRENT_GENERATIONS = 2;
    this.SEGMENT_DURATION = 3000; // 3 seconds per segment
  }

  /**
   * Initialize the buffer for a track with lyrics
   * @param {string} trackId - Track identifier
   * @param {Object} trackData - Track metadata
   * @param {string} lyrics - Full lyrics text
   * @param {number} bpm - Track BPM
   * @param {Object} audioFeatures - Audio analysis features
   * @returns {Promise<boolean>} - Success status
   */
  async initializeBuffer(trackId, trackData, lyrics, bpm, audioFeatures) {
    if (!trackId) return false;
    
    console.log(`Initializing lyrics buffer for track ${trackId}`);
    
    try {
      let segments;
      let detectedLyrics = lyrics;
      let audioAnalysis = audioFeatures;
      
      // If we don't have lyrics, try to detect them using the audio analyzer
      if (!detectedLyrics || detectedLyrics.length < 10) {
        try {
          const audioAnalyzer = require('./audio-analyzer');
          
          // Get stream URL for the track
          const streamUrl = trackData.uploaded
            ? `/api/upload/stream/${trackData.id}`
            : `/api/soundcloud/stream/${trackData.id}`;
            
          // If we're running on the server, we can convert the relative path
          const serverPath = path.join(process.cwd(), 'public', streamUrl);
          
          // First try to detect lyrics
          const lyricsResult = await audioAnalyzer.detectLyrics(serverPath, trackData);
          
          // Use the detected lyrics
          if (lyricsResult && lyricsResult.text && lyricsResult.text.length > 10) {
            detectedLyrics = lyricsResult.text;
            console.log(`Used AI to detect lyrics for track ${trackId}`);
            
            // If we have timing data, use it to create segments directly
            if (lyricsResult.timing && lyricsResult.timing.length > 0) {
              // Convert timing data to segments
              segments = lyricsResult.timing.map(segment => ({
                lines: [segment.text],
                text: segment.text,
                startTime: segment.start,
                endTime: segment.end,
                duration: segment.end - segment.start,
                progress: segment.start / (trackData?.duration || 180000),
                generated: false,
                videoUrl: null
              }));
              
              console.log(`Created ${segments.length} segments from AI timing data`);
            }
          }
          
          // Try to get extended audio features if we don't have them
          if (!audioFeatures || Object.keys(audioFeatures).length === 0) {
            try {
              const analysis = await audioAnalyzer.analyzeTrackFile(serverPath);
              if (analysis && analysis.rhythm) {
                audioAnalysis = {
                  bpm: analysis.rhythm.bpm || bpm || 120,
                  key: analysis.rhythm.key,
                  scale: analysis.rhythm.scale,
                  energy: 0.6, // Default energy level
                  bassEnergy: 0.5,
                  midEnergy: 0.5,
                  highEnergy: 0.5
                };
                
                // Add energy data if available
                if (analysis.rhythm.energyBands && analysis.rhythm.energyBands.length > 0) {
                  // Calculate averages
                  const sumBands = analysis.rhythm.energyBands.reduce(
                    (acc, band) => {
                      acc.low += band.lowEnergy || 0;
                      acc.mid += band.midEnergy || 0;
                      acc.high += band.highEnergy || 0;
                      return acc;
                    },
                    { low: 0, mid: 0, high: 0 }
                  );
                  
                  const count = analysis.rhythm.energyBands.length;
                  audioAnalysis.bassEnergy = sumBands.low / count;
                  audioAnalysis.midEnergy = sumBands.mid / count;
                  audioAnalysis.highEnergy = sumBands.high / count;
                }
                
                console.log(`Used audio analyzer to get advanced features for track ${trackId}`);
              }
            } catch (analysisError) {
              console.error('Error getting audio analysis:', analysisError);
            }
          }
          
          // Try to generate LTX prompts directly if we have all the necessary data
          if (!segments && detectedLyrics) {
            try {
              // Get LTX prompts with timing
              const ltxPrompts = await audioAnalyzer.generateLTXPrompts(serverPath, trackData);
              
              if (ltxPrompts && ltxPrompts.length > 0) {
                segments = ltxPrompts.map(prompt => ({
                  lines: [prompt.text],
                  text: prompt.text,
                  startTime: prompt.startTime,
                  endTime: prompt.endTime,
                  duration: prompt.endTime - prompt.startTime,
                  progress: prompt.startTime / (trackData?.duration || 180000),
                  generated: false,
                  videoUrl: null,
                  prompt: prompt.prompt, // Pre-generated prompt
                  audioFeatures: prompt.audioFeatures
                }));
                
                console.log(`Created ${segments.length} segments with pre-generated LTX prompts`);
              }
            } catch (promptError) {
              console.error('Error generating LTX prompts:', promptError);
            }
          }
        } catch (audioAnalyzerError) {
          console.error('Error using audio analyzer:', audioAnalyzerError);
        }
      }
      
      // If we still don't have segments, create them from lyrics text
      if (!segments) {
        segments = this.segmentLyrics(detectedLyrics || '', trackData?.duration || 0);
      }
      
      // Create entry in buffer
      this.videoBuffer.set(trackId, {
        segments,
        currentSegment: 0,
        generatedSegments: new Map(),
        trackData,
        bpm: audioAnalysis?.bpm || bpm || 120,
        audioFeatures: audioAnalysis || audioFeatures || {}
      });
      
      // Start pre-generating initial segments
      await this.preGenerateSegments(trackId, 0);
      
      return true;
    } catch (error) {
      console.error('Error initializing lyrics buffer:', error);
      return false;
    }
  }

  /**
   * Segment lyrics into time-aligned chunks
   * @param {string} lyrics - Full lyrics text
   * @param {number} duration - Track duration in ms
   * @returns {Array} - Array of segmented lyrics with timestamps
   */
  segmentLyrics(lyrics, duration) {
    if (!lyrics || !duration) {
      return [];
    }
    
    const lines = lyrics.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];
    
    const segments = [];
    const averageSegmentDuration = Math.min(
      this.SEGMENT_DURATION, 
      duration / Math.max(lines.length / 2, 1)
    );
    
    let currentSegment = [];
    let currentDuration = 0;
    let startTime = 0;
    
    for (let i = 0; i < lines.length; i++) {
      currentSegment.push(lines[i]);
      currentDuration += averageSegmentDuration;
      
      // Create a new segment every ~3 seconds or 2-3 lines
      if (currentDuration >= this.SEGMENT_DURATION || currentSegment.length >= 3 || i === lines.length - 1) {
        const endTime = startTime + currentDuration;
        const progress = endTime / duration;
        
        segments.push({
          lines: currentSegment,
          text: currentSegment.join('\n'),
          startTime,
          endTime,
          duration: currentDuration,
          progress,
          generated: false,
          videoUrl: null
        });
        
        currentSegment = [];
        startTime = endTime;
        currentDuration = 0;
      }
    }
    
    return segments;
  }

  /**
   * Pre-generate videos for upcoming lyric segments
   * @param {string} trackId - Track identifier
   * @param {number} currentIndex - Current segment index
   * @returns {Promise<void>}
   */
  async preGenerateSegments(trackId, currentIndex) {
    const bufferData = this.videoBuffer.get(trackId);
    if (!bufferData) return;
    
    const segments = bufferData.segments;
    if (!segments || segments.length === 0) return;
    
    // Calculate which segments to pre-generate
    const endIndex = Math.min(currentIndex + this.LOOKAHEAD_SEGMENTS, segments.length);
    
    // Queue segments for generation
    for (let i = currentIndex; i < endIndex; i++) {
      const segment = segments[i];
      
      // Skip if already generated or in queue
      if (segment.generated || segment.inQueue) continue;
      
      // Mark as in queue
      segment.inQueue = true;
      
      // Add to generation queue
      this.generationQueue.push({
        trackId,
        segmentIndex: i,
        segment,
        audioFeatures: bufferData.audioFeatures,
        trackData: bufferData.trackData,
        bpm: bufferData.bpm
      });
    }
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processGenerationQueue();
    }
  }

  /**
   * Process the generation queue
   * @returns {Promise<void>}
   */
  async processGenerationQueue() {
    if (this.isProcessingQueue || this.generationQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    try {
      // Process up to MAX_CONCURRENT_GENERATIONS items at once
      const itemsToProcess = this.generationQueue.splice(0, this.MAX_CONCURRENT_GENERATIONS);
      
      // Generate videos concurrently
      await Promise.all(
        itemsToProcess.map(item => this.generateVideoForSegment(
          item.trackId,
          item.segmentIndex,
          item.segment,
          item.audioFeatures,
          item.trackData,
          item.bpm
        ))
      );
      
      // Continue processing queue if items remain
      if (this.generationQueue.length > 0) {
        this.processGenerationQueue();
      } else {
        this.isProcessingQueue = false;
      }
    } catch (error) {
      console.error('Error processing generation queue:', error);
      this.isProcessingQueue = false;
      
      // Continue with next items despite error
      if (this.generationQueue.length > 0) {
        setTimeout(() => this.processGenerationQueue(), 1000);
      }
    }
  }

  /**
   * Generate video for a specific lyric segment
   * @param {string} trackId - Track identifier
   * @param {number} segmentIndex - Segment index
   * @param {Object} segment - Lyric segment data
   * @param {Object} audioFeatures - Audio analysis features
   * @param {Object} trackData - Track metadata
   * @param {number} bpm - Track BPM
   * @returns {Promise<Object>} - Generated video data
   */
  async generateVideoForSegment(trackId, segmentIndex, segment, audioFeatures, trackData, bpm) {
    if (!segment || segment.generated) return null;
    
    // Create cache key
    const cacheKey = `${trackId}-segment-${segmentIndex}`;
    const cachePath = path.join(this.cacheDir, `${cacheKey}.mp4`);
    
    // Check if already cached
    if (fs.existsSync(cachePath)) {
      console.log(`Using cached segment video for ${trackId} segment ${segmentIndex}`);
      
      // Update buffer
      const bufferData = this.videoBuffer.get(trackId);
      if (bufferData && bufferData.segments[segmentIndex]) {
        bufferData.segments[segmentIndex].generated = true;
        bufferData.segments[segmentIndex].videoUrl = `/videos/lyric-segments/${cacheKey}.mp4`;
        bufferData.generatedSegments.set(segmentIndex, {
          url: `/videos/lyric-segments/${cacheKey}.mp4`,
          segment
        });
      }
      
      return {
        url: `/videos/lyric-segments/${cacheKey}.mp4`,
        cached: true
      };
    }
    
    try {
      console.log(`Generating video for track ${trackId} segment ${segmentIndex}: "${segment.text.substring(0, 50)}..."`);
      
      // Extract beat and energy information for this segment
      const segmentAudioFeatures = this.getSegmentAudioFeatures(audioFeatures, segment);
      
      // Calculate progress-adjusted BPM (tempo might change during song)
      const adjustedBpm = this.calculateAdjustedBpm(bpm, segment.progress);
      
      // Base LTX prompt on lyrics segment using Claude-powered AI prompt generation
      // Note: generateAIPrompt is now async, so we need to await the result
      const prompt = await this.generateAIPrompt(
        segment.text, 
        segment.lines?.[Math.floor(segment.lines.length/2)]?.text || segment.text.substring(0, 50),
        this.extractKeywords(segment.text),
        this.analyzeEmotionalTone(segment.text),
        this.determineStyleFromLyrics(segment.text),
        {
          trackData,
          bpm: adjustedBpm,
          energyLevel: segmentAudioFeatures.energy > 0.7 ? 'high-energy' : 
                      (segmentAudioFeatures.energy < 0.4 ? 'ambient' : 'moderate'),
          audioFeatures: segmentAudioFeatures
        }
      );
      
      // Call LTX video generation API
      const endpoint = 'http://localhost:3000/api/vj/content/ltx-generate';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          audioFeatures: {
            ...segmentAudioFeatures,
            bpm: adjustedBpm
          },
          style: this.determineStyleFromLyrics(segment.text),
          trackId,
          trackData,
          isLyricSegment: true,
          segmentIndex,
          segmentText: segment.text
        })
      });
      
      if (!response.ok) {
        throw new Error(`Video generation API error: ${response.status}`);
      }
      
      const videoData = await response.json();
      
      // If the video generation succeeded and returned a file URL
      if (videoData && videoData.url && videoData.url.startsWith('/videos/')) {
        // Save a copy to our dedicated lyrics segments folder for faster retrieval
        const sourceFile = path.join(process.cwd(), 'public', videoData.url);
        
        if (fs.existsSync(sourceFile)) {
          // Copy to cache
          fs.copyFileSync(sourceFile, cachePath);
          
          // Update buffer
          const bufferData = this.videoBuffer.get(trackId);
          if (bufferData && bufferData.segments[segmentIndex]) {
            bufferData.segments[segmentIndex].generated = true;
            bufferData.segments[segmentIndex].videoUrl = `/videos/lyric-segments/${cacheKey}.mp4`;
            bufferData.generatedSegments.set(segmentIndex, {
              url: `/videos/lyric-segments/${cacheKey}.mp4`,
              segment,
              videoData
            });
          }
          
          return {
            ...videoData,
            segmentUrl: `/videos/lyric-segments/${cacheKey}.mp4`
          };
        }
      }
      
      throw new Error('Video generation failed or invalid response');
    } catch (error) {
      console.error(`Error generating video for segment ${segmentIndex}:`, error);
      
      // Mark as error but allow future retry
      const bufferData = this.videoBuffer.get(trackId);
      if (bufferData && bufferData.segments[segmentIndex]) {
        bufferData.segments[segmentIndex].error = true;
        bufferData.segments[segmentIndex].inQueue = false;
      }
      
      return null;
    }
  }

  /**
   * Get the current video segment for a track at a specific time
   * @param {string} trackId - Track identifier
   * @param {number} currentTime - Current playback time in ms
   * @returns {Object|null} - Video segment data or null
   */
  getCurrentVideoSegment(trackId, currentTime) {
    const bufferData = this.videoBuffer.get(trackId);
    if (!bufferData) return null;
    
    const segments = bufferData.segments;
    if (!segments || segments.length === 0) return null;
    
    // Find the segment that corresponds to the current time
    let currentSegmentIndex = -1;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (currentTime >= segment.startTime && currentTime < segment.endTime) {
        currentSegmentIndex = i;
        break;
      }
      
      // If we're past this segment but haven't reached the next one
      if (currentTime >= segment.endTime && 
          (i === segments.length - 1 || currentTime < segments[i + 1].startTime)) {
        currentSegmentIndex = i;
        break;
      }
    }
    
    // If we couldn't find a matching segment, use the last one
    if (currentSegmentIndex === -1 && segments.length > 0) {
      currentSegmentIndex = segments.length - 1;
    }
    
    // If segment index changed, trigger pre-generation of upcoming segments
    if (currentSegmentIndex !== bufferData.currentSegment) {
      bufferData.currentSegment = currentSegmentIndex;
      this.preGenerateSegments(trackId, currentSegmentIndex);
    }
    
    // Return the current segment if it's been generated
    if (currentSegmentIndex >= 0 && bufferData.generatedSegments.has(currentSegmentIndex)) {
      return bufferData.generatedSegments.get(currentSegmentIndex);
    }
    
    // Otherwise, look for the most recent generated segment
    for (let i = currentSegmentIndex; i >= 0; i--) {
      if (bufferData.generatedSegments.has(i)) {
        return bufferData.generatedSegments.get(i);
      }
    }
    
    return null;
  }

  /**
   * Calculate BPM adjusted for song progress (in case of tempo changes)
   * @param {number} baseBpm - Base BPM of the track
   * @param {number} progress - Progress through the track (0-1)
   * @returns {number} - Adjusted BPM
   */
  calculateAdjustedBpm(baseBpm, progress) {
    // This is a simplified model assuming BPM might change by up to 10% through the song
    // Could be replaced with actual tempo detection from audio analysis
    const maxVariation = 0.1; // 10% variation
    const variationCurve = Math.sin(progress * Math.PI); // Peaks in the middle
    const adjustment = 1 + (variationCurve * maxVariation);
    
    return Math.round(baseBpm * adjustment);
  }

  /**
   * Extract audio features for a specific segment based on time
   * @param {Object} audioFeatures - Full track audio features
   * @param {Object} segment - Lyric segment data
   * @returns {Object} - Segment-specific audio features
   */
  getSegmentAudioFeatures(audioFeatures, segment) {
    if (!audioFeatures) {
      return {
        energy: 0.5,
        bassEnergy: 0.5,
        midEnergy: 0.5,
        highEnergy: 0.5,
        frequencyProfile: 'balanced'
      };
    }
    
    // If we have real-time audio features, we would extract the specific portion
    // based on segment.startTime and segment.endTime
    
    // For now, we'll estimate based on segment progress (intensity often builds through a song)
    const progress = segment.progress || 0;
    
    // Energy often follows an arc (builds up, peaks, then drops)
    const energyProgress = Math.sin(progress * Math.PI);
    const baseEnergy = audioFeatures.energy || 0.5;
    
    // Adjust energy based on progress and some randomness
    const energy = Math.min(1.0, Math.max(0.2, baseEnergy + ((energyProgress - 0.5) * 0.3) + ((Math.random() - 0.5) * 0.1)));
    
    // Calculate bass energy (often stronger in chorus sections)
    const isLikelyChorus = energyProgress > 0.7;
    const bassEnergy = isLikelyChorus ? 
      Math.min(1.0, (audioFeatures.bassEnergy || 0.5) * 1.3) : 
      (audioFeatures.bassEnergy || 0.5);
    
    return {
      energy,
      bassEnergy,
      midEnergy: audioFeatures.midEnergy || 0.5,
      highEnergy: audioFeatures.highEnergy || 0.4,
      frequencyProfile: this.determineFrequencyProfile(segment, energy, bassEnergy)
    };
  }

  /**
   * Determine frequency profile based on lyrics segment
   * @param {Object} segment - Lyric segment data
   * @param {number} energy - Energy level
   * @param {number} bassEnergy - Bass energy level
   * @returns {string} - Frequency profile descriptor
   */
  determineFrequencyProfile(segment, energy, bassEnergy) {
    const text = segment.text.toLowerCase();
    
    // Check for keywords that suggest frequency profile
    if (text.includes('bass') || text.includes('drop') || text.includes('beat') || bassEnergy > 0.7) {
      return 'bass-heavy';
    }
    
    if (text.includes('high') || text.includes('bright') || text.includes('light')) {
      return 'treble-focused';
    }
    
    if (energy > 0.8) {
      return 'full-spectrum';
    }
    
    return 'balanced';
  }

  /**
   * Create an LTX prompt based on lyric segment
   * @param {Object} segment - Lyric segment data
   * @param {Object} trackData - Track metadata
   * @param {number} bpm - Track BPM
   * @param {Object} audioFeatures - Segment audio features
   * @returns {string} - LTX prompt
   */
  createPromptFromSegment(segment, trackData, bpm, audioFeatures) {
    const lines = segment.lines || [segment.text];
    const mainLine = lines[Math.floor(lines.length / 2) || 0]; // Pick middle line as focus
    
    // Extract key words/themes
    const keywords = this.extractKeywords(segment.text);
    
    // Determine energy level
    const energyLevel = audioFeatures.energy > 0.7 ? 'high-energy' : 
                       (audioFeatures.energy < 0.4 ? 'ambient' : 'moderate');
    
    // Analyze emotional tone
    const emotion = this.analyzeEmotionalTone(segment.text);
    
    // Determine visual style based on lyrics
    const visualStyle = this.determineStyleFromLyrics(segment.text);
    
    // Use AI prompt generator instead of template-based approach
    return this.generateAIPrompt(segment.text, mainLine, keywords, emotion, visualStyle, {
      trackData,
      bpm,
      energyLevel,
      audioFeatures
    });
  }
  
  /**
   * Generate creative AI prompts based on lyrics and context using Claude API
   * @param {string} fullText - Complete lyrics segment text
   * @param {string} mainLine - Main focal line from lyrics
   * @param {Array} keywords - Extracted keywords from lyrics
   * @param {string} emotion - Emotional tone analysis
   * @param {string} visualStyle - Determined visual style
   * @param {Object} context - Additional context (trackData, bpm, etc.)
   * @returns {string} - AI-generated creative prompt
   */
  async generateAIPrompt(fullText, mainLine, keywords, emotion, visualStyle, context) {
    try {
      console.log('Generating AI prompt from lyrics:', mainLine);
      
      // Use Claude API for creative prompt generation
      const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 'YOUR_CLAUDE_API_KEY';
      
      // Check if we have all the necessary data
      if (!fullText || !mainLine) {
        throw new Error('Missing lyrics data for prompt generation');
      }
      
      // Prepare context for Claude
      const { bpm, energyLevel, audioFeatures, trackData } = context;
      
      // Construct the genre info if available
      const genreInfo = trackData?.genre ? `The genre of the music is ${trackData.genre}.` : '';
      
      // Construct audio features information
      const audioInfo = `
The song has these audio characteristics:
- BPM: ${bpm || 120}
- Energy level: ${energyLevel || 'moderate'}
- Bass energy: ${audioFeatures?.bassEnergy > 0.7 ? 'high' : audioFeatures?.bassEnergy < 0.4 ? 'low' : 'medium'}
- High frequency energy: ${audioFeatures?.highEnergy > 0.7 ? 'high' : audioFeatures?.highEnergy < 0.4 ? 'low' : 'medium'}
      `.trim();
      
      // Prepare prompt for Claude API
      const systemPrompt = `You are an expert visual prompt engineer for music videos. You create detailed, creative, visually rich prompts for Lightricks/LTX-Video, a high-quality video generation model. This model works best with detailed, descriptive language and expects prompt length of 1-3 sentences.`;
      
      const userPrompt = `
Create a visually rich, creative prompt for a music video visualization based on these song lyrics:

"${fullText}"

The main line of focus is: "${mainLine}"

The emotional tone of the lyrics is: ${emotion}
Key visual themes/keywords: ${keywords.join(', ')}
Visual style suggestion: ${visualStyle}

${audioInfo}
${genreInfo}

The prompt should:
1. Be 1-3 sentences (50-150 words)
2. Incorporate the emotional tone and visual keywords creatively
3. Include concrete visual descriptions that would work well in a video
4. Reference the BPM and musical energy in visual terms
5. Be rich and detailed enough for Lightricks/LTX-Video to generate a compelling music visualization

Important: ONLY return the prompt itself with no explanations or additional text.
      `.trim();
      
      try {
        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307', // Using the fastest Claude model for real-time prompt generation
            max_tokens: 300,
            system: systemPrompt,
            messages: [
              { role: 'user', content: userPrompt }
            ]
          })
        });
        
        if (!response.ok) {
          console.error('Claude API error:', response.status);
          throw new Error(`Claude API error: ${response.status}`);
        }
        
        const result = await response.json();
        const generatedPrompt = result.content[0].text.trim();
        
        console.log('Claude-generated prompt:', generatedPrompt);
        
        // Store this prompt for potential reuse or analysis
        if (!this.generatedPrompts) this.generatedPrompts = [];
        this.generatedPrompts.push(generatedPrompt);
        
        return generatedPrompt;
      } catch (apiError) {
        console.error('Error calling Claude API:', apiError);
        // Fall back to template-based approach if API fails
        return this.generateTemplatePrompt(fullText, mainLine, keywords, emotion, visualStyle, context);
      }
    } catch (error) {
      console.error('Error in AI prompt generation:', error);
      // Fallback to template-based generation
      return this.generateTemplatePrompt(fullText, mainLine, keywords, emotion, visualStyle, context);
    }
  }
  
  /**
   * Fallback template-based prompt generator
   * @param {string} fullText - Complete lyrics segment text
   * @param {string} mainLine - Main focal line from lyrics
   * @param {Array} keywords - Extracted keywords from lyrics
   * @param {string} emotion - Emotional tone analysis
   * @param {string} visualStyle - Determined visual style
   * @param {Object} context - Additional context (trackData, bpm, etc.)
   * @returns {string} - Template-generated creative prompt
   */
  generateTemplatePrompt(fullText, mainLine, keywords, emotion, visualStyle, context) {
    console.log('Falling back to template-based prompt generation');
    
    // Creative prompt templates with placeholders
    const promptTemplates = [
      "A {visualStyle} scene where {keyword1} transforms into {creativeElement}, with {emotion} atmosphere pulsing at {bpm} BPM",
      "The essence of '{mainLine}' visualized as {creativeElement} flowing through a {visualStyle} landscape with {energyLevel} movement",
      "{creativeElement} dancing in a {emotion} {visualStyle} environment, embodying the lyrics '{mainLine}' with {energyLevel} rhythm",
      "A {emotion} journey through {creativeElement}, where {keyword1} and {keyword2} manifest as {visualStyle} visuals synced to {bpm} BPM",
      "The {emotion} feeling of '{mainLine}' visualized as {creativeElement} in a {visualStyle} setting with {bassDescription} bass",
      "Immersive {visualStyle} world where {keyword1} appears as {creativeElement}, evolving with {energyLevel} motion, inspired by '{mainLine}'",
      "A {visualStyle} visualization where '{mainLine}' manifests as {creativeElement} flowing with {emotionAdj} {energyLevel} energy",
      "{creativeElement} swirling through a {emotion} {visualStyle} dimension, pulsing to the rhythm of {bpm} BPM, embodying '{mainLine}'",
      "A {visualStyle} interpretation of '{mainLine}' with {creativeElement} forming and dissolving in {emotion} waves at {bpm} BPM",
      "The lyrics '{mainLine}' portrayed through {creativeElement} in a {emotion} {visualStyle} space with {bassDescription} undertones"
    ];
    
    // Creative visual elements based on different themes
    const creativeElements = {
      nature: [
        "swirling nebula clouds", "flowing liquid rivers of color", "blooming geometric flowers", 
        "crystalline ice structures", "volcanic energy eruptions", "cosmic star formations"
      ],
      urban: [
        "neon city skylines", "digital cityscapes", "geometric urban patterns", 
        "holographic street projections", "electric network grids", "cybernetic architecture"
      ],
      abstract: [
        "fractal patterns", "morphing geometric shapes", "particle swarms", 
        "dynamic wave formations", "kaleidoscopic mandalas", "neural network visualizations"
      ],
      emotional: [
        "glowing emotional auras", "flowing energy ribbons", "pulsing heart-like forms", 
        "memory fragments", "dream-like color clouds", "emotional spectrum visualizations"
      ]
    };
    
    // Select thematic group based on visual style
    let themeGroup = "abstract";
    if (visualStyle.includes("natur") || visualStyle.includes("organic")) themeGroup = "nature";
    if (visualStyle.includes("city") || visualStyle.includes("cyber")) themeGroup = "urban";
    if (visualStyle.includes("emotion") || visualStyle.includes("dream")) themeGroup = "emotional";
    
    // Select creative elements from the appropriate theme
    const themeElements = creativeElements[themeGroup];
    const creativeElement = themeElements[Math.floor(Math.random() * themeElements.length)];
    
    // Emotional adjectives to enhance descriptions
    const emotionAdjectives = {
      joyful: ["radiant", "vibrant", "uplifting"],
      sad: ["somber", "melancholic", "wistful"],
      energetic: ["dynamic", "electric", "pulsating"],
      calm: ["serene", "tranquil", "peaceful"],
      angry: ["intense", "fierce", "powerful"],
      romantic: ["passionate", "tender", "intimate"],
      mysterious: ["enigmatic", "ethereal", "otherworldly"],
      nostalgic: ["reminiscent", "vintage", "timeless"]
    };
    
    // Select emotional adjective
    const emotionKey = emotion.toLowerCase();
    const emotionAdj = emotionAdjectives[emotionKey] ? 
                       emotionAdjectives[emotionKey][Math.floor(Math.random() * emotionAdjectives[emotionKey].length)] : 
                       emotion;
    
    // Bass description based on audio features
    const { audioFeatures } = context;
    const bassEnergy = audioFeatures?.bassEnergy || 0.5;
    const bassDescription = bassEnergy > 0.7 ? "deep resonating" : 
                           bassEnergy > 0.4 ? "rhythmic" : "subtle";
    
    // Select random template
    const template = promptTemplates[Math.floor(Math.random() * promptTemplates.length)];
    
    // Fill placeholders in the template
    let prompt = template
      .replace("{visualStyle}", visualStyle)
      .replace("{creativeElement}", creativeElement)
      .replace("{emotion}", emotion)
      .replace("{emotionAdj}", emotionAdj)
      .replace("{mainLine}", mainLine.trim())
      .replace("{energyLevel}", context.energyLevel)
      .replace("{bpm}", context.bpm || 120)
      .replace("{bassDescription}", bassDescription)
      .replace("{keyword1}", keywords[0] || "music")
      .replace("{keyword2}", keywords[1] || "rhythm");
    
    // Add style specification if we have a current style
    if (this.currentStyle) {
      prompt += `. ${this.currentStyle} style.`;
    }
    
    // Add genre influence if available
    if (context.trackData?.genre) {
      prompt += ` ${context.trackData.genre} music atmosphere.`;
    }
    
    console.log('Template-generated prompt:', prompt);
    
    return prompt;
  }
  

  /**
   * Extract important keywords from lyrics for visual theming
   * @param {string} text - Lyrics text
   * @returns {Array} - Keywords
   */
  extractKeywords(text) {
    if (!text) return [];
    
    // Remove common stop words and focus on visually significant words
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 
                             'and', 'or', 'but', 'if', 'then', 'else', 'when', 'up', 'down', 'in', 'out',
                             'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
                             'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may',
                             'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
                             'us', 'them', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'its', 'our',
                             'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'of']);
    
    // Identify common visual themes
    const visualThemes = new Set(['light', 'dark', 'bright', 'shadow', 'color', 'red', 'blue', 'green',
                                 'yellow', 'purple', 'black', 'white', 'gold', 'silver', 'sky', 'sun',
                                 'moon', 'star', 'fire', 'water', 'earth', 'air', 'heart', 'eye', 'hand',
                                 'mountain', 'ocean', 'river', 'city', 'street', 'road', 'dream', 'night',
                                 'day', 'dance', 'move', 'fly', 'run', 'jump', 'fall', 'rise', 'glow',
                                 'shine', 'glitter', 'smoke', 'cloud', 'rain', 'storm', 'lightning',
                                 'electric', 'digital', 'neon', 'crystal', 'glass', 'metal', 'space',
                                 'universe', 'cosmic', 'energy', 'power', 'force', 'beat', 'pulse',
                                 'rhythm', 'flow', 'wave', 'vibration', 'echo']);
    
    // Split text into words and filter
    const words = text.toLowerCase()
                     .replace(/[^\w\s]/g, '') // Remove punctuation
                     .split(/\s+/)
                     .filter(word => 
                       !stopWords.has(word) && 
                       (word.length > 3 || visualThemes.has(word))
                     );
    
    // Prioritize visual themes
    const themes = words.filter(word => visualThemes.has(word));
    const otherKeywords = words.filter(word => !visualThemes.has(word))
                               .slice(0, 5); // Limit to 5 non-theme words
    
    return [...themes, ...otherKeywords].slice(0, 8); // Return up to 8 keywords
  }

  /**
   * Analyze emotional tone of lyrics
   * @param {string} text - Lyrics text
   * @returns {string} - Emotional tone descriptor
   */
  analyzeEmotionalTone(text) {
    if (!text) return 'neutral';
    
    const lowerText = text.toLowerCase();
    
    // Simplified emotion detection based on keyword matching
    const emotions = {
      joyful: ['happy', 'joy', 'celebrate', 'smile', 'laugh', 'dance', 'love', 'good', 'best', 'wonderful', 
              'great', 'beautiful', 'amazing', 'light', 'shine', 'bright', 'pleasure', 'paradise'],
      
      sad: ['sad', 'cry', 'tear', 'pain', 'hurt', 'broken', 'alone', 'lonely', 'miss', 'gone', 'lost',
           'dark', 'cold', 'empty', 'sorrow', 'grief', 'blue', 'down'],
      
      angry: ['angry', 'anger', 'rage', 'hate', 'mad', 'fight', 'battle', 'war', 'enemy', 'against',
             'burn', 'fire', 'destroy', 'break', 'shout', 'scream', 'fury', 'violent'],
      
      calm: ['calm', 'peace', 'quiet', 'soft', 'gentle', 'slow', 'easy', 'rest', 'relax', 'dream',
            'float', 'flow', 'smooth', 'serene', 'tranquil', 'still'],
      
      energetic: ['energy', 'power', 'strong', 'fast', 'run', 'jump', 'move', 'alive', 'wild', 'free',
                 'high', 'rush', 'electric', 'dynamic', 'vibrant', 'pulse', 'beat', 'rhythm'],
      
      romantic: ['love', 'heart', 'kiss', 'touch', 'hold', 'embrace', 'passion', 'desire', 'want',
               'need', 'close', 'together', 'forever', 'sweet', 'tender'],
      
      mysterious: ['mystery', 'secret', 'hidden', 'shadow', 'dark', 'unknown', 'wonder', 'question',
                 'strange', 'weird', 'deep', 'fog', 'smoke', 'ghost', 'spirit']
    };
    
    // Count emotion keywords
    const scores = {};
    for (const [emotion, keywords] of Object.entries(emotions)) {
      scores[emotion] = keywords.reduce((count, keyword) => {
        // Count occurrences of each keyword
        const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
        const matches = lowerText.match(regex);
        return count + (matches ? matches.length : 0);
      }, 0);
    }
    
    // Find emotion with highest score
    let dominantEmotion = 'neutral';
    let highestScore = 0;
    
    for (const [emotion, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        dominantEmotion = emotion;
      }
    }
    
    // If no clear emotion, check for overall sentiment
    if (highestScore < 2) {
      if (scores.joyful + scores.energetic + scores.romantic > scores.sad + scores.angry) {
        dominantEmotion = 'positive';
      } else if (scores.sad + scores.angry > scores.joyful + scores.energetic + scores.romantic) {
        dominantEmotion = 'negative';
      } else {
        dominantEmotion = 'neutral';
      }
    }
    
    return dominantEmotion;
  }

  /**
   * Determine visual style based on lyrics content
   * @param {string} text - Lyrics text
   * @returns {string} - Visual style descriptor
   */
  determineStyleFromLyrics(text) {
    if (!text) return 'neon';
    
    const lowerText = text.toLowerCase();
    
    // Style-keyword mapping
    const styles = {
      neon: ['neon', 'light', 'glow', 'bright', 'city', 'night', 'electric', 'shine', 'flash'],
      
      retro: ['retro', 'wave', 'synthwave', 'vintage', 'old', 'past', 'memory', 'remember', '80s', '90s'],
      
      abstract: ['abstract', 'shape', 'form', 'art', 'color', 'pattern', 'design', 'space', 'geometry'],
      
      nature: ['nature', 'tree', 'flower', 'water', 'ocean', 'sea', 'river', 'mountain', 'sky', 'cloud', 
              'rain', 'earth', 'forest', 'green', 'blue', 'natural'],
      
      space: ['space', 'star', 'galaxy', 'universe', 'cosmic', 'planet', 'orbit', 'moon', 'sun', 
             'nebula', 'astro', 'infinity', 'void', 'endless'],
      
      glitch: ['glitch', 'error', 'break', 'digital', 'computer', 'tech', 'static', 'distort', 'corrupt'],
      
      liquid: ['liquid', 'water', 'flow', 'fluid', 'wave', 'ocean', 'sea', 'river', 'stream', 'pour', 
              'drip', 'splash', 'melt']
    };
    
    // Count style keywords
    const scores = {};
    for (const [style, keywords] of Object.entries(styles)) {
      scores[style] = keywords.reduce((count, keyword) => {
        const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
        const matches = lowerText.match(regex);
        return count + (matches ? matches.length : 0);
      }, 0);
    }
    
    // Find style with highest score
    let dominantStyle = 'neon'; // Default
    let highestScore = 0;
    
    for (const [style, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        dominantStyle = style;
      }
    }
    
    // If no clear style match, use emotion to decide
    if (highestScore < 2) {
      const emotion = this.analyzeEmotionalTone(text);
      
      // Map emotions to styles
      const emotionStyleMap = {
        joyful: 'neon',
        sad: 'liquid',
        angry: 'glitch',
        calm: 'nature',
        energetic: 'abstract',
        romantic: 'neon',
        mysterious: 'space',
        positive: 'neon',
        negative: 'glitch',
        neutral: 'abstract'
      };
      
      dominantStyle = emotionStyleMap[emotion] || 'neon';
    }
    
    return dominantStyle;
  }
  
  /**
   * Clear buffer for a track
   * @param {string} trackId - Track identifier
   */
  clearBuffer(trackId) {
    this.videoBuffer.delete(trackId);
    
    // Remove from generation queue
    this.generationQueue = this.generationQueue.filter(item => item.trackId !== trackId);
  }
}

module.exports = new LyricsBufferService();