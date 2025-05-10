# Audio Transcription App

A simple web application that allows you to transcribe M4A audio files using OpenAI's Whisper API and organize the transcription with follow-up items.

## Features

- Drag and drop M4A file upload
- Secure API key input
- Automatic transcription using OpenAI's Whisper API
- Organized display of transcription
- Automatic extraction of follow-up items (bullet points and numbered lists)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```

## Usage

1. Enter your OpenAI API key in the input field
2. Drag and drop an M4A file or click to select one
3. Wait for the transcription to complete
4. View the transcription and follow-up items

## Requirements

- Node.js 14 or higher
- An OpenAI API key with access to the Whisper API

## Security Note

Your OpenAI API key is stored only in the browser's memory and is never sent to any server other than OpenAI's API endpoints.
