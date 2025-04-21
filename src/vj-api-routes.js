/**
 * VJ Visualizer API Routes
 * Provides endpoints for external content sources, focusing on AI generation
 */
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const lyricsService = require('./lyrics-service');
const lyricsBufferService = require('./lyrics-buffer-service');

// Import Hugging Face SDK if available
let HfInference;
try {
  const { HfInference: HfInferenceImport } = require('@huggingface/inference');
  HfInference = HfInferenceImport;
} catch (err) {
  console.log('Hugging Face SDK not installed, falling back to fetch API');
}

// Load environment variables or use defaults
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY || '';
// Keep these for backward compatibility
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const AI_GENERATION_API_KEY = process.env.AI_GENERATION_API_KEY || '';

// Cache for API responses to reduce rate limiting issues
const apiCache = {
  unsplash: new Map(),
  pexels: new Map(),
  ai: new Map(),
  ltx: new Map()
};

// Cache expiration time (15 minutes)
const CACHE_EXPIRATION = 15 * 60 * 1000;

/**
 * Fetch images from Unsplash API
 */
router.get('/content/unsplash', async (req, res) => {
  try {
    const { query = 'abstract', count = 5 } = req.query;
    
    // Check cache first
    const cacheKey = `${query}-${count}`;
    const cachedData = apiCache.unsplash.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_EXPIRATION) {
      console.log('Returning cached Unsplash data');
      return res.json(cachedData.data);
    }
    
    // No valid API key, return demo data
    if (!UNSPLASH_ACCESS_KEY) {
      console.log('No Unsplash API key, returning demo data');
      const demoData = generateDemoImageData(count, query);
      apiCache.unsplash.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
    
    // Call Unsplash API
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache the result
    apiCache.unsplash.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching Unsplash content:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

/**
 * Fetch videos/photos from Pexels API
 */
router.get('/content/pexels', async (req, res) => {
  try {
    const { query = 'abstract', count = 5, type = 'videos' } = req.query;
    
    // Check cache first
    const cacheKey = `${query}-${count}-${type}`;
    const cachedData = apiCache.pexels.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_EXPIRATION) {
      console.log('Returning cached Pexels data');
      return res.json(cachedData.data);
    }
    
    // No valid API key, return demo data
    if (!PEXELS_API_KEY) {
      console.log('No Pexels API key, returning demo data');
      const demoData = {
        videos: type === 'videos' ? generateDemoVideoData(count, query) : [],
        photos: type === 'photos' ? generateDemoImageData(count, query) : []
      };
      apiCache.pexels.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
    
    // Call Pexels API - first try videos
    const endpoint = type === 'videos' ? 
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${count}` :
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`;
    
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': PEXELS_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache the result
    apiCache.pexels.set(cacheKey, { data, timestamp: Date.now() });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching Pexels content:', error);
    res.status(500).json({ error: 'Failed to fetch videos/photos' });
  }
});

/**
 * Generate images using AI API - now using Hugging Face
 */
router.post('/content/ai-generate', async (req, res) => {
  try {
    const { prompt, style = 'neon' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Check cache first - use prompt as cache key
    const cacheKey = prompt;
    const cachedData = apiCache.ai.get(cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_EXPIRATION) {
      console.log('Returning cached AI generated content');
      return res.json(cachedData.data);
    }
    
    // For local testing and development, return demo data
    // Change this to use your local Hugging Face or alternative API
    console.log('Using AI generation with Hugging Face');
    
    try {
      // Build a suitable prompt
      const finalPrompt = `${prompt} in ${style} style, music visualizer, highly detailed`;
      
      // Use Hugging Face Inference API
      if (!HUGGING_FACE_API_KEY) {
        console.log('No Hugging Face API key or empty key, returning demo content');
        // Create a proper AI-like response that will work well
        const demoData = {
          url: `/videos/demo-${Math.floor(Math.random() * 5) + 1}.jpg`,
          width: 1024,
          height: 1024,
          prompt: finalPrompt
        };
        console.log('Returning cached AI generated content', demoData);
        apiCache.ai.set(cacheKey, { data: demoData, timestamp: Date.now() });
        return res.json(demoData);
      }
      
      console.log('Using Hugging Face API with key:', HUGGING_FACE_API_KEY.substring(0, 4) + '...');
      
      let base64Image;
      
      // Use the SDK if available, otherwise fall back to fetch
      if (HfInference) {
        // Using the Hugging Face SDK
        console.log('Using Hugging Face SDK for image generation');
        const hf = new HfInference(HUGGING_FACE_API_KEY);
        
        // Generate image using Stable Diffusion XL
        const imageBlob = await hf.textToImage({
          model: 'stabilityai/stable-diffusion-xl-base-1.0',
          inputs: finalPrompt,
          parameters: {
            num_inference_steps: 30,
            guidance_scale: 7.5
          }
        });
        
        // Convert blob to base64
        const arrayBuffer = await imageBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      } else {
        // Fallback to using fetch API
        console.log('Using fetch API for Hugging Face requests');
        const response = await fetch(
          'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              inputs: finalPrompt,
              parameters: {
                num_inference_steps: 30,
                guidance_scale: 7.5
              }
            })
          }
        );
        
        if (!response.ok) {
          throw new Error(`Hugging Face API error: ${response.status}`);
        }
        
        // Hugging Face returns the image directly as binary
        const imageBuffer = await response.buffer();
        base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      }
      
      const generatedImageData = {
        url: base64Image,
        width: 1024,
        height: 1024,
        prompt: finalPrompt
      };
      
      // Cache the result
      apiCache.ai.set(cacheKey, { data: generatedImageData, timestamp: Date.now() });
      
      return res.json(generatedImageData);
      
    } catch (error) {
      console.error('Error with Hugging Face generation:', error);
      // Fall back to demo data on error
      const demoData = {
        url: `/videos/demo-${Math.floor(Math.random() * 5) + 1}.jpg`,
        width: 1024,
        height: 1024,
        prompt: finalPrompt
      };
      console.log('Returning fallback AI generated content', demoData);
      apiCache.ai.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
  } catch (error) {
    console.error('Error generating AI content:', error);
    res.status(500).json({ error: 'Failed to generate AI content' });
  }
});

/**
 * Generate videos using LTX (Latent Transformer for Video Generation)
 */
router.post('/content/ltx-generate', async (req, res) => {
  try {
    const { audioFeatures, prompt, style = 'neon', trackId, trackData, isCustomPrompt } = req.body;
    
    // Process audio features to refine prompt
    const bpm = audioFeatures?.bpm || 120;
    const energy = audioFeatures?.energy || 0.5;
    const bassEnergy = audioFeatures?.bassEnergy || 0.5;
    const energyLevel = energy > 0.7 ? 'high-energy' : (energy < 0.3 ? 'ambient' : 'moderate');
    
    // Create dynamic prompt based on audio analysis
    let finalPrompt = prompt || `${style} music visualization at ${bpm} BPM with ${energyLevel} movement, abstract digital art`;
    
    // Try to fetch lyrics if trackId or trackData is provided - ENHANCED LYRICS HANDLING
    let lyrics = null;
    let trackInfo = null;
    if (trackId || trackData) {
      try {
        // Check if we already have lyrics cached
        const lyricsKey = trackId ? `track-${trackId}` : null;
        const cachedLyrics = lyricsKey ? apiCache.ltx.get(lyricsKey) : null;
        
        if (cachedLyrics && cachedLyrics.data && cachedLyrics.data.lyrics) {
          console.log('Using cached lyrics for track');
          lyrics = cachedLyrics.data.lyrics;
          trackInfo = cachedLyrics.data.trackInfo;
        } 
        // Only fetch if we don't have cached lyrics
        else if (trackData) {
          console.log('Fetching lyrics for track:', trackData.title);
          trackInfo = lyricsService.extractTrackInfo(trackData);
          
          console.log('Extracted track info:', trackInfo);
          
          // Make extra effort to get lyrics
          try {
            // First try with extracted track info
            lyrics = await lyricsService.getLyrics(trackInfo.artist, trackInfo.title);
            console.log('Fetched lyrics with track info extraction');
            
            // If lyrics are too short or empty, try with original title/artist
            if (!lyrics || lyrics.length < 50) {
              console.log('Lyrics too short, trying with original track info');
              const originalArtist = trackData.user?.username || trackInfo.artist;
              const originalTitle = trackData.title || trackInfo.title;
              
              lyrics = await lyricsService.getLyrics(originalArtist, originalTitle);
              console.log('Fetched lyrics with original track info');
            }
          } catch (innerError) {
            console.error('Error in lyrics fetching, trying fallback method:', innerError);
            
            // Last attempt with any available info
            const artist = trackData.user?.username || trackInfo.artist || 'Unknown';
            const title = trackData.title || trackInfo.title || 'Unknown';
            
            try {
              lyrics = await lyricsService.getLyrics(artist, title);
              console.log('Fetched lyrics with fallback method');
            } catch (fallbackError) {
              console.error('All lyrics fetching methods failed:', fallbackError);
            }
          }
          
          // Cache the lyrics
          if (lyricsKey && lyrics) {
            console.log('Caching lyrics for future use');
            apiCache.ltx.set(lyricsKey, { 
              data: { lyrics, trackInfo },
              timestamp: Date.now() 
            });
          }
        }
        
        // If we have lyrics and it's not a custom prompt, enhance the prompt with lyrics
      // If it is a custom prompt, just store the lyrics for the response but don't modify the prompt
      if (lyrics) {
        // Parse the full lyrics for semantics and extract key themes
        let keyThemes = [];
        const lyricsLines = lyrics.split('\n').filter(line => line.trim().length > 0);
        
        // Find common words and phrases (simplified approach)
        const wordCounts = {};
        const skipWords = ['the', 'and', 'to', 'a', 'it', 'I', 'in', 'my', 'you', 'for', 'of', 'on', 'is', 'are'];
        
        // Count words for themes
        lyricsLines.forEach(line => {
          const words = line.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
          words.forEach(word => {
            if (word.length > 3 && !skipWords.includes(word)) {
              wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
          });
        });
        
        // Get top themes (words that appear most frequently)
        keyThemes = Object.entries(wordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(entry => entry[0]);
        
        // Extract multiple snippets from beginning, middle, and end
        const beginSnippet = lyricsService.formatLyrics(lyricsLines.slice(0, 4).join('\n'), 3);
        
        const middleStart = Math.floor(lyricsLines.length / 2) - 2;
        const middleSnippet = lyricsService.formatLyrics(
          lyricsLines.slice(middleStart, middleStart + 4).join('\n'), 3
        );
        
        const endStart = Math.max(0, lyricsLines.length - 4);
        const endSnippet = lyricsService.formatLyrics(
          lyricsLines.slice(endStart).join('\n'), 3
        );
        
        // If not a custom prompt, combine everything into a comprehensive prompt
        if (!isCustomPrompt) {
          finalPrompt = `${finalPrompt}. Create visuals based on song themes: ${keyThemes.join(', ')}. Opening lyrics: "${beginSnippet}". Middle part: "${middleSnippet}". Ending: "${endSnippet}"`;
          console.log('Added comprehensive lyrics to auto-generated prompt');
        } else {
          console.log('Using custom prompt with detected lyrics available as context');
        }
      }
      } catch (lyricsError) {
        console.error('Error adding lyrics to prompt:', lyricsError);
        // Continue without lyrics if there's an error
      }
    }
    
    // Calculate cache key based on prompt and audio features
    const cacheKey = `${finalPrompt}-${bpm}-${energyLevel}`;
    const cachedData = apiCache.ltx.get(cacheKey);
    
    // Check cache first
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_EXPIRATION) {
      console.log('Returning cached LTX generated content');
      // Add lyrics to the cached data if we have them
      if (lyrics && !cachedData.data.lyrics) {
        cachedData.data.lyrics = lyrics;
      }
      return res.json(cachedData.data);
    }
    
    // If no API key, return demo content
    if (!HUGGING_FACE_API_KEY) {
      console.log('No Hugging Face API key, returning demo video content');
      const demoData = generateDemoLTXContent(finalPrompt, style, bpm);
      // Add lyrics to the demo data
      if (lyrics) {
        demoData.lyrics = lyrics;
      }
      apiCache.ltx.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
    
    console.log(`Generating LTX video with prompt: "${finalPrompt}"`);
    
    try {
      // Create parameters for Lightricks/LTX-Video model
      // Parameters adjusted based on model specs and music properties
      const parameters = {
        // LTX-Video works best with resolutions divisible by 32
        width: 576, // 576 is divisible by 32
        height: 320, // 320 is divisible by 32
        
        // LTX model requires num_frames divisible by 8+1
        num_inference_steps: Math.min(50, 20 + Math.floor(energy * 30)), // More steps for higher quality
        num_frames: 25, // 24+1, divisible by 8+1 for LTX model
        fps: 24, // LTX-Video works well at 24 FPS
        
        // Quality control parameters
        guidance_scale: 7.5,
        
        // Optional parameters for LTX
        seed: Math.floor(Math.random() * 1000000), // Random seed for variety
        negative_prompt: "blurry, low quality, distorted, pixelated, low resolution",
        
        // These were specific to Stability's model, but we'll keep adapted versions for LTX
        motion_strength: Math.min(0.95, 0.5 + (bassEnergy * 0.5)), // Control motion intensity with bass energy
      };
      
      if (HfInference) {
        // Using the Hugging Face SDK for video generation
        console.log('Using Hugging Face SDK for video generation');
        const hf = new HfInference(HUGGING_FACE_API_KEY);
        
        // Using Lightricks LTX-Video for high-quality video generation
        const modelId = 'Lightricks/LTX-Video';
        
        // For Lightricks/LTX-Video, we can use text-to-video directly, but let's also
        // generate a keyframe for preview purposes using Stable Diffusion
        const initialImageBlob = await hf.textToImage({
          model: 'stabilityai/stable-diffusion-xl-base-1.0',
          inputs: finalPrompt,
          parameters: {
            num_inference_steps: 30,
            guidance_scale: 7.5
          }
        });
        
        // Convert image blob to base64 for display and storage
        const imageArrayBuffer = await initialImageBlob.arrayBuffer();
        const imageBuffer = Buffer.from(imageArrayBuffer);
        const keyframeImage = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        
        // LTX-Video supports direct text-to-video, so we'll use that instead of image-to-video
        // This should provide better quality videos that match the prompt more accurately
        const videoResponse = await fetch(
          `https://api-inference.huggingface.co/models/${modelId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: finalPrompt,
              parameters: {
                ...parameters,
                negative_prompt: parameters.negative_prompt || ""
              }
            })
          }
        );
        
        if (!videoResponse.ok) {
          throw new Error(`Video generation API error: ${videoResponse.status}`);
        }
        
        // Get video data as binary
        const videoBuffer = await videoResponse.buffer();
        
        // Save video file with timestamp to avoid collisions
        const timestamp = Date.now();
        const videoFileName = `ltx-${timestamp}.mp4`;
        const videoPath = path.join(process.cwd(), 'public', 'videos', videoFileName);
        
        // Ensure videos directory exists
        const videosDir = path.join(process.cwd(), 'public', 'videos');
        if (!fs.existsSync(videosDir)) {
          fs.mkdirSync(videosDir, { recursive: true });
        }
        
        // Write video file
        fs.writeFileSync(videoPath, videoBuffer);
        
        // Create response data
        const generatedVideoData = {
          url: `/videos/${videoFileName}`,
          keyframe: keyframeImage,
          width: parameters.width,
          height: parameters.height,
          prompt: finalPrompt,
          bpm: bpm,
          energyLevel: energyLevel,
          style: style,
          lyrics: lyrics // Include lyrics if we have them
        };
        
        // Cache the result
        apiCache.ltx.set(cacheKey, { data: generatedVideoData, timestamp: Date.now() });
        
        return res.json(generatedVideoData);
      } else {
        // Fallback to direct fetch API approach
        console.log('Falling back to fetch API for video generation');
        
        // Get keyframe image for preview purposes
        const imageResponse = await fetch(
          'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              inputs: finalPrompt,
              parameters: {
                num_inference_steps: 30,
                guidance_scale: 7.5
              }
            })
          }
        );
        
        if (!imageResponse.ok) {
          throw new Error(`Image generation API error: ${imageResponse.status}`);
        }
        
        // Convert image to base64 for display
        const imageBuffer = await imageResponse.buffer();
        const keyframeImage = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        
        // Use LTX-Video for text-to-video generation (direct approach)
        console.log('Using Lightricks/LTX-Video for text-to-video generation');
        const videoResponse = await fetch(
          'https://api-inference.huggingface.co/models/Lightricks/LTX-Video',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              inputs: finalPrompt,
              parameters: {
                ...parameters,
                negative_prompt: parameters.negative_prompt || ""
              }
            })
          }
        );
        
        if (!videoResponse.ok) {
          throw new Error(`Video generation API error: ${videoResponse.status}`);
        }
        
        // Get video data as binary
        const videoBuffer = await videoResponse.buffer();
        
        // Save video file with timestamp to avoid collisions
        const timestamp = Date.now();
        const videoFileName = `ltx-${timestamp}.mp4`;
        const videoPath = path.join(process.cwd(), 'public', 'videos', videoFileName);
        
        // Ensure videos directory exists
        const videosDir = path.join(process.cwd(), 'public', 'videos');
        if (!fs.existsSync(videosDir)) {
          fs.mkdirSync(videosDir, { recursive: true });
        }
        
        // Write video file
        fs.writeFileSync(videoPath, videoBuffer);
        
        // Create response data
        const generatedVideoData = {
          url: `/videos/${videoFileName}`,
          keyframe: keyframeImage,
          width: parameters.width,
          height: parameters.height,
          prompt: finalPrompt,
          bpm: bpm,
          energyLevel: energyLevel,
          style: style,
          lyrics: lyrics // Include lyrics if we have them
        };
        
        // Cache the result
        apiCache.ltx.set(cacheKey, { data: generatedVideoData, timestamp: Date.now() });
        
        return res.json(generatedVideoData);
      }
    } catch (error) {
      console.error('Error with video generation:', error);
      
      // Fall back to demo data on error
      const demoData = generateDemoLTXContent(finalPrompt, style, bpm);
      console.log('Returning fallback LTX demo content', demoData);
      apiCache.ltx.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
  } catch (error) {
    console.error('Error generating LTX video content:', error);
    res.status(500).json({ error: 'Failed to generate video content' });
  }
});

/**
 * Generate demo image data for when API keys are not available
 * @param {number} count - Number of items to generate
 * @param {string} query - Query term to include in generated data
 * @return {Array} Array of demo image objects
 */
function generateDemoImageData(count, query) {
  const colors = [
    '#FF00FF', '#00FFFF', '#FF8800', '#2200FF', '#00FF22', 
    '#FF0088', '#88FF00', '#8800FF', '#FF2200', '#0088FF'
  ];
  
  // Ensure we have at least 5 images
  const actualCount = Math.max(count, 5);
  
  console.log(`Generating ${actualCount} demo images for query: ${query}`);
  
  return Array.from({ length: actualCount }, (_, i) => ({
    id: `demo-image-${i}`,
    urls: {
      regular: `/videos/demo-${i % 5 + 1}.jpg`,
      full: `/videos/demo-${i % 5 + 1}.jpg`
    },
    color: colors[i % colors.length],
    width: 1920,
    height: 1080,
    user: {
      name: 'Demo Artist'
    },
    description: `Demo image for "${query}" query`
  }));
}

/**
 * Generate demo video data for when API keys are not available
 * @param {number} count - Number of items to generate
 * @param {string} query - Query term to include in generated data
 * @return {Array} Array of demo video objects
 */
function generateDemoVideoData(count, query) {
  // Ensure we have at least 6 videos
  const actualCount = Math.max(count, 6);
  
  console.log(`Generating ${actualCount} demo videos for query: ${query}`);
  
  const videoOptions = [
    'abstract_1.mp4',
    'grid_tunnel.mp4',
    'liquid_colors.mp4',
    'neon_city.mp4',
    'particle_flow.mp4',
    'retro_waves.mp4'
  ];
  
  return Array.from({ length: actualCount }, (_, i) => ({
    id: `demo-video-${i}`,
    video_files: [
      {
        quality: 'hd',
        link: `/videos/${videoOptions[i % videoOptions.length]}`,
        width: 1920,
        height: 1080
      }
    ],
    user: {
      name: 'Demo Creator'
    },
    description: `Demo video for "${query}" query`
  }));
}

/**
 * Get lyrics for a track
 */
router.post('/content/lyrics', async (req, res) => {
  try {
    const { trackId, artist, title, trackData } = req.body;
    
    if (!artist && !title && !trackData) {
      return res.status(400).json({ error: 'Artist and title or trackData is required' });
    }
    
    let trackInfo;
    
    // Extract info from track data if provided
    if (trackData) {
      trackInfo = lyricsService.extractTrackInfo(trackData);
    } else {
      trackInfo = { artist, title };
    }
    
    // Get lyrics
    const lyrics = await lyricsService.getLyrics(trackInfo.artist, trackInfo.title);
    
    // Create trackId-based cache key if possible
    if (trackId) {
      const cacheKey = `track-${trackId}`;
      // Store in memory cache
      apiCache.ltx.set(cacheKey, { 
        data: { lyrics, trackInfo },
        timestamp: Date.now() 
      });
    }
    
    res.json({
      success: true,
      trackInfo,
      lyrics
    });
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

/**
 * Initialize lyrics buffer for a track
 */
router.post('/content/lyrics-buffer/init', async (req, res) => {
  try {
    const { trackId, trackData, audioFeatures } = req.body;
    
    if (!trackId || !trackData) {
      return res.status(400).json({ error: 'Track ID and track data are required' });
    }
    
    // Extract track info for API-based lyrics
    const trackInfo = lyricsService.extractTrackInfo(trackData);
    let lyrics = null;
    let lyricsSource = 'none';
    
    try {
      // First try the API-based approach
      lyrics = await lyricsService.getLyrics(trackInfo.artist, trackInfo.title);
      lyricsSource = 'api';
      
      // Check if we got actual lyrics or just the placeholder
      if (lyrics.includes('[No lyrics found for')) {
        // Try using the audio analyzer for AI-based detection
        try {
          const audioAnalyzer = require('./audio-analyzer');
          await audioAnalyzer.initialize();
          
          // Get stream URL based on source
          const streamUrl = trackData.uploaded
            ? `/api/upload/stream/${trackData.id}`
            : `/api/soundcloud/stream/${trackData.id}`;
            
          // Convert to server path
          const serverPath = path.join(process.cwd(), 'public', streamUrl);
          
          // Detect lyrics using AI
          const detectionResult = await audioAnalyzer.detectLyrics(serverPath, trackData);
          
          if (detectionResult && detectionResult.text && !detectionResult.text.includes('Error detecting lyrics')) {
            lyrics = detectionResult.text;
            lyricsSource = detectionResult.source;
            console.log(`Used AI to detect lyrics for track ${trackId}, source: ${lyricsSource}`);
          }
        } catch (audioError) {
          console.error('Error using audio analyzer for lyrics:', audioError);
        }
      }
    } catch (lyricsError) {
      console.error('Error getting lyrics:', lyricsError);
    }
    
    // Initialize the lyrics buffer
    const bpm = trackData.bpm || audioFeatures?.bpm || 120;
    const success = await lyricsBufferService.initializeBuffer(
      trackId, 
      trackData, 
      lyrics, 
      bpm, 
      audioFeatures
    );
    
    if (success) {
      res.json({
        success: true,
        message: 'Lyrics buffer initialized',
        trackInfo,
        lyricsSource,
        segmentCount: lyricsBufferService.videoBuffer.get(trackId)?.segments.length || 0
      });
    } else {
      res.status(500).json({ error: 'Failed to initialize lyrics buffer' });
    }
  } catch (error) {
    console.error('Error initializing lyrics buffer:', error);
    res.status(500).json({ error: 'Failed to initialize lyrics buffer' });
  }
});

/**
 * Get video segment for current lyrics
 */
router.post('/content/lyrics-buffer/segment', async (req, res) => {
  try {
    const { trackId, currentTime, audioFeatures } = req.body;
    
    if (!trackId) {
      return res.status(400).json({ error: 'Track ID is required' });
    }
    
    // Convert to milliseconds if in seconds
    const timeMs = currentTime > 1000 ? currentTime : currentTime * 1000;
    
    // Get current segment from buffer
    const segmentData = lyricsBufferService.getCurrentVideoSegment(trackId, timeMs);
    
    if (segmentData) {
      // If we have audioFeatures, update buffer with latest data
      if (audioFeatures && lyricsBufferService.videoBuffer.has(trackId)) {
        const bufferData = lyricsBufferService.videoBuffer.get(trackId);
        bufferData.audioFeatures = {
          ...bufferData.audioFeatures,
          ...audioFeatures
        };
      }
      
      res.json({
        success: true,
        segment: segmentData
      });
    } else {
      // No segment available yet - return a status that allows polling
      res.json({
        success: false,
        pending: true,
        message: 'Segment generation in progress'
      });
    }
  } catch (error) {
    console.error('Error getting lyrics segment:', error);
    res.status(500).json({ error: 'Failed to get lyrics segment' });
  }
});

/**
 * Generate demo LTX content when API is not available
 * @param {string} prompt - The prompt used to generate the content
 * @param {string} style - Visual style
 * @param {number} bpm - Beats per minute
 * @return {Object} Demo video data object
 */
function generateDemoLTXContent(prompt, style, bpm) {
  // Use existing videos from the library for demo purposes
  const videoOptions = [
    'abstract_1.mp4',
    'grid_tunnel.mp4',
    'liquid_colors.mp4',
    'neon_city.mp4',
    'particle_flow.mp4',
    'retro_waves.mp4'
  ];
  
  // Select a video based on style
  let videoIndex = 0;
  switch(style) {
    case 'neon':
      videoIndex = 3; // neon_city.mp4
      break;
    case 'cyberpunk':
      videoIndex = 3; // neon_city.mp4
      break;
    case 'retro':
      videoIndex = 5; // retro_waves.mp4
      break;
    case 'pastel':
      videoIndex = 2; // liquid_colors.mp4
      break;
    default:
      videoIndex = Math.floor(Math.random() * videoOptions.length);
  }
  
  // Create a fake keyframe image
  const keyframeImageIndex = Math.floor(Math.random() * 5) + 1;
  
  return {
    url: `/videos/${videoOptions[videoIndex]}`,
    keyframe: `/videos/demo-${keyframeImageIndex}.jpg`,
    width: 1920,
    height: 1080,
    prompt: prompt,
    bpm: bpm,
    energyLevel: bpm > 140 ? 'high-energy' : (bpm < 90 ? 'ambient' : 'moderate'),
    style: style,
    demo: true
  };
}

module.exports = router;