# VJ Visualizer Video Library

This directory contains video files for the VJ Visualizer component of DJAI.

## Adding Videos

1. Add video files in .mp4 format to this directory
2. Recommended video spec:
   - Resolution: 1080p (1920x1080)
   - Duration: 10-30 seconds looping clips
   - Format: H.264/MP4
   - Framerate: 30fps
   - Aspect ratio: 16:9

## Demo Videos

For development, you might want to download royalty-free video loops:

- [Pexels Free Stock Videos](https://www.pexels.com/videos/)
- [Pixabay Free Videos](https://pixabay.com/videos/)
- [Videvo Free Stock Footage](https://www.videvo.net/stock-video-footage/)

## Recommended Video Types

For best results, use abstract, looping videos that work well with music visualization:

1. abstract_1.mp4 - Abstract fluid colors
2. grid_tunnel.mp4 - Grid-based perspective tunnel
3. liquid_colors.mp4 - Liquid color transitions
4. neon_city.mp4 - Neon cityscape loop
5. particle_flow.mp4 - Particle flow animations
6. retro_waves.mp4 - Retrowave/synthwave grid landscape

## AI-Generated Content Integration

The VJ Visualizer can also generate visuals using AI image generation APIs. 
Set up the following environment variables to enable AI content generation:

```
AI_GENERATION_API_KEY=your_api_key_here
AI_GENERATION_ENDPOINT=https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image
```

## Unsplash and Pexels Integration

To use Unsplash and Pexels images/videos, set up the following environment variables:

```
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
PEXELS_API_KEY=your_pexels_api_key
```