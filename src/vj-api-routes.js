/**
 * VJ Visualizer API Routes
 * Provides endpoints for external content sources, focusing on AI generation
 */
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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
    const { audioFeatures, prompt, style = 'neon' } = req.body;
    
    // Process audio features to refine prompt
    const bpm = audioFeatures?.bpm || 120;
    const energy = audioFeatures?.energy || 0.5;
    const bassEnergy = audioFeatures?.bassEnergy || 0.5;
    const energyLevel = energy > 0.7 ? 'high-energy' : (energy < 0.3 ? 'ambient' : 'moderate');
    
    // Create dynamic prompt based on audio analysis
    const finalPrompt = prompt || `${style} music visualization at ${bpm} BPM with ${energyLevel} movement, abstract digital art`;
    
    // Calculate cache key based on prompt and audio features
    const cacheKey = `${finalPrompt}-${bpm}-${energyLevel}`;
    const cachedData = apiCache.ltx.get(cacheKey);
    
    // Check cache first
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_EXPIRATION) {
      console.log('Returning cached LTX generated content');
      return res.json(cachedData.data);
    }
    
    // If no API key, return demo content
    if (!HUGGING_FACE_API_KEY) {
      console.log('No Hugging Face API key, returning demo video content');
      const demoData = generateDemoLTXContent(finalPrompt, style, bpm);
      apiCache.ltx.set(cacheKey, { data: demoData, timestamp: Date.now() });
      return res.json(demoData);
    }
    
    console.log(`Generating LTX video with prompt: "${finalPrompt}"`);
    
    try {
      // Create parameters for video generation
      // Adjust these based on the specific model requirements
      const parameters = {
        num_inference_steps: Math.min(50, 20 + Math.floor(energy * 30)), // More steps for higher quality
        fps: Math.min(24, Math.max(8, Math.floor(bpm/10))), // Dynamic FPS based on tempo
        num_frames: 24, // Default number of frames to generate
        guidance_scale: 7.5,
        width: 576,
        height: 320, // Lower resolution for performance
        motion_bucket_id: Math.floor(bassEnergy * 100), // Control motion intensity with bass energy
        noise_aug_strength: 0.02 // Control noise/grain in generation
      };
      
      if (HfInference) {
        // Using the Hugging Face SDK for video generation
        console.log('Using Hugging Face SDK for video generation');
        const hf = new HfInference(HUGGING_FACE_API_KEY);
        
        // Select the appropriate model
        // Using Stability AI's SVD (Stable Video Diffusion) model
        const modelId = 'stabilityai/stable-video-diffusion-img2vid-xt';
        
        // First generate an image as a keyframe with text-to-image
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
        
        // Generate video from the keyframe image
        // Fallback to fetch since the SDK may not fully support image-to-video yet
        const videoResponse = await fetch(
          `https://api-inference.huggingface.co/models/${modelId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: keyframeImage,
              parameters: parameters
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
          style: style
        };
        
        // Cache the result
        apiCache.ltx.set(cacheKey, { data: generatedVideoData, timestamp: Date.now() });
        
        return res.json(generatedVideoData);
      } else {
        // Fallback to direct fetch API approach
        console.log('Falling back to fetch API for video generation');
        
        // Generate image first using text-to-image
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
        
        // Convert image to base64 for use in video generation
        const imageBuffer = await imageResponse.buffer();
        const keyframeImage = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
        
        // Use image-to-video endpoint with the generated image
        const videoResponse = await fetch(
          'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid-xt',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HUGGING_FACE_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              inputs: keyframeImage,
              parameters: parameters
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
          style: style
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