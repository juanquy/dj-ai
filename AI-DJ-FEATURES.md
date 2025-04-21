# AI DJ Features Guide

## Video Visualizer Configuration

The video visualizer now uses AI-generated content by default, powered by Hugging Face's image generation models.

### Setting Up Hugging Face API

1. Create a Hugging Face account at [huggingface.co](https://huggingface.co)
2. Generate an API key from your [settings page](https://huggingface.co/settings/tokens)
3. Add the API key to your `.env` file:
   ```
   HUGGING_FACE_API_KEY=your_key_here
   ```

### Available Models

The default model is `stabilityai/stable-diffusion-xl-base-1.0`, but you can customize this in the code. Other recommended models:

- `runwayml/stable-diffusion-v1-5` - Faster, less resource-intensive
- `stabilityai/stable-diffusion-2-1` - Good quality/speed balance
- `SG161222/Realistic_Vision_V1.4` - More photorealistic outputs

### Customizing Prompts

The AI prompts can be customized in the frontend code. Edit the `aiPromptTemplates` object in `public/js/vj-visualizer.js` to adjust prompts for different visual styles.

### Fallback Mechanism

If the Hugging Face API key is not set or the API call fails, the system will automatically fall back to using local demo content.

## Installation

1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `.env` file based on `sample.env` and add your Hugging Face API key
4. Start the server with `npm start` or `npm run dev` for development