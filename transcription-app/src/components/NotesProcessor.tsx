import React, { useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Spinner,
  useToast,
  Button,
  Textarea,
} from '@chakra-ui/react';
import OpenAI from 'openai';

interface NotesProcessorProps {
  onProcessedNotes: (text: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  apiKey: string;
}

const NotesProcessor: React.FC<NotesProcessorProps> = ({
  onProcessedNotes,
  isLoading,
  setIsLoading,
  apiKey,
}) => {
  const [rawNotes, setRawNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawNotes(e.target.value);
  };

  // Helper function to add delay between API calls
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const processNotes = async (rawNotes: string) => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const openai = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true
      });

      // First, clean and deduplicate the raw text
      const initialCleanupResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a highly skilled assistant trained to clean and organize text. Your task is to remove duplicates and clean up the text while preserving its meaning."
          },
          {
            role: "user",
            content: `Please clean this text by:
1. Removing any duplicate paragraphs or sentences
2. Removing any repeated phrases or words
3. Maintaining the original meaning and context
4. Preserving important medical terminology and numbers

Here's the text to clean:

${rawNotes}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const cleanedText = initialCleanupResponse.choices[0]?.message?.content;
      if (!cleanedText) {
        throw new Error('No content received from initial cleanup');
      }

      // Split cleaned text into smaller chunks
      const chunks = splitTextIntoChunks(cleanedText, 1000);
      let processedChunks: string[] = [];

      // Process each chunk sequentially with delay
      for (const chunk of chunks) {
        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "You are a highly skilled assistant trained to organize and clean notes while fully preserving their original meaning and depth. Process the given text chunk while maintaining context and coherence."
              },
              {
                role: "user",
                content: `Process this chunk of notes, maintaining context and coherence with other chunks. Focus on:
1. Organizing the content logically
2. Removing any remaining duplicates
3. Ensuring smooth transitions between sections
4. Preserving all medical terminology and measurements

Here's the chunk to process:

${chunk}`
              }
            ],
            temperature: 0.3,
            max_tokens: 500
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('No content received from API');
          }
          processedChunks.push(content);

          await delay(1000);
        } catch (error: any) {
          if (error.message?.includes('429')) {
            await delay(5000);
            continue;
          }
          throw error;
        }
      }

      // Final combination with emphasis on removing duplicates
      await delay(1000);
      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a highly skilled assistant trained to organize and clean notes while fully preserving their original meaning and depth. Your task is to combine the processed chunks into a final document while ensuring no duplicates remain."
          },
          {
            role: "user",
            content: `Combine these processed chunks into a single, well-organized document. Please:
1. Remove any remaining duplicates
2. Ensure smooth transitions between sections
3. Maintain consistent formatting
4. Preserve all medical terminology and measurements
5. Organize content logically with clear sections

Here are the chunks to combine:

${processedChunks.join('\n\n')}

Please provide the final organized document.`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const finalContent = finalResponse.choices[0]?.message?.content;
      if (!finalContent) {
        throw new Error('No content received from final API call');
      }
      onProcessedNotes(finalContent);
    } catch (err) {
      console.error('Processing error:', err);
      let errorMessage = 'Failed to process notes';
      
      if (err instanceof Error) {
        if (err.message.includes('401')) {
          errorMessage = 'Invalid API key. Please check your API key and try again.';
        } else if (err.message.includes('429')) {
          errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to split text into chunks
  const splitTextIntoChunks = (text: string, chunkSize: number): string[] => {
    const chunks: string[] = [];
    let currentChunk = '';
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        // If a single sentence is longer than chunkSize, split it by words
        if (sentence.length > chunkSize) {
          const words = sentence.split(' ');
          let tempChunk = '';
          for (const word of words) {
            if ((tempChunk + word).length > chunkSize) {
              chunks.push(tempChunk.trim());
              tempChunk = word;
            } else {
              tempChunk += (tempChunk ? ' ' : '') + word;
            }
          }
          if (tempChunk) {
            currentChunk = tempChunk;
          }
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  };

  return (
    <VStack gap={4} align="stretch">
      <Textarea
        placeholder="Enter your raw notes here..."
        value={rawNotes}
        onChange={handleNotesChange}
        size="lg"
        minH="200px"
        bg="white"
      />
      
      <Button
        colorScheme="blue"
        size="lg"
        onClick={() => processNotes(rawNotes)}
        isLoading={isLoading}
        loadingText="Processing..."
      >
        Process Notes
      </Button>
    </VStack>
  );
};

export default NotesProcessor; 