import React, { useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Spinner,
  useToast,
  Button,
  Textarea,
  Progress,
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
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const toast = useToast();

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawNotes(e.target.value);
  };

  // Helper function to add delay between API calls
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to estimate tokens (rough approximation)
  const estimateTokens = (text: string): number => {
    // Rough estimate: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  };

  // Helper function to retry API calls with exponential backoff
  const retryWithBackoff = async (
    operation: () => Promise<any>,
    maxRetries: number = 5,
    initialDelay: number = 5000
  ) => {
    let retries = 0;
    let currentDelay = initialDelay;

    while (retries < maxRetries) {
      try {
        await wait(2000);
        return await operation();
      } catch (error: any) {
        if (error.message?.includes('429') && retries < maxRetries - 1) {
          retries++;
          console.log(`Rate limited. Retrying in ${currentDelay/1000} seconds... (Attempt ${retries}/${maxRetries})`);
          setStatus(`Rate limited. Retrying in ${currentDelay/1000} seconds... (Attempt ${retries}/${maxRetries})`);
          await wait(currentDelay);
          currentDelay *= 2;
          continue;
        }
        throw error;
      }
    }
  };

  const processNotes = async (rawNotes: string) => {
    if (!apiKey) {
      setError('Please enter your OpenAI API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgress(0);
    setStatus('Starting processing...');

    try {
      const openai = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true
      });

      // Split text into very small chunks (approximately 300 tokens each)
      const chunks = splitTextIntoChunks(rawNotes, 300);
      console.log(`Split text into ${chunks.length} chunks`);
      setStatus(`Processing ${chunks.length} chunks...`);
      
      let processedChunks: string[] = [];
      let currentMinuteTokens = 0;
      const TOKEN_LIMIT_PER_MINUTE = 8000; // Conservative limit below the 10k cap

      // Process each chunk with token tracking
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const estimatedTokens = estimateTokens(chunk);
        
        setProgress((i / chunks.length) * 30); // First 30% of progress
        setStatus(`Processing chunk ${i + 1} of ${chunks.length}...`);
        
        if (currentMinuteTokens + estimatedTokens > TOKEN_LIMIT_PER_MINUTE) {
          console.log('Token limit approaching, waiting for 60 seconds...');
          setStatus('Token limit approaching, waiting for 60 seconds...');
          await wait(60000); // Wait for a full minute
          currentMinuteTokens = 0;
        }

        const processedChunk = await retryWithBackoff(async () => {
          console.log(`Processing chunk ${i + 1}...`);
          const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "You are a highly skilled assistant trained to clean and organize text. Your task is to process this small chunk of text while preserving its meaning and medical terminology."
              },
              {
                role: "user",
                content: `Process this chunk of text:
1. Remove any duplicates
2. Clean up formatting
3. Preserve all medical terminology and measurements
4. Maintain the original meaning

Text to process:

${chunk}`
              }
            ],
            temperature: 0.3,
            max_tokens: 200 // Very conservative token limit
          });
          return response;
        });

        const content = processedChunk.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content received from API');
        }
        processedChunks.push(content);
        currentMinuteTokens += estimatedTokens;
        console.log(`Successfully processed chunk ${i + 1}`);

        await wait(3000);
      }

      setStatus('Combining processed chunks...');
      console.log('Starting chunk combination...');

      // Combine chunks in smaller groups to stay within token limits
      const combinedChunks: string[] = [];
      let currentGroup: string[] = [];
      let currentGroupTokens = 0;
      const totalGroups = Math.ceil(processedChunks.length / 5); // Assuming ~5 chunks per group
      let currentGroupIndex = 0;

      for (let i = 0; i < processedChunks.length; i++) {
        const chunk = processedChunks[i];
        const chunkTokens = estimateTokens(chunk);
        
        setProgress(30 + (currentGroupIndex / totalGroups) * 30); // Next 30% of progress
        setStatus(`Combining chunks into sections (${currentGroupIndex + 1}/${totalGroups})...`);

        if (currentGroupTokens + chunkTokens > 2000) {
          console.log(`Processing group ${currentGroupIndex + 1}...`);
          const groupResponse = await retryWithBackoff(async () => {
            return await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: "You are a highly skilled assistant trained to combine text chunks into a coherent document."
                },
                {
                  role: "user",
                  content: `Combine these chunks into a coherent section:

${currentGroup.join('\n\n')}`
                }
              ],
              temperature: 0.3,
              max_tokens: 400
            });
          });

          const groupContent = groupResponse.choices[0]?.message?.content;
          if (groupContent) {
            combinedChunks.push(groupContent);
            console.log(`Successfully combined group ${currentGroupIndex + 1}`);
          }

          currentGroup = [chunk];
          currentGroupTokens = chunkTokens;
          currentGroupIndex++;
          await wait(3000);
        } else {
          currentGroup.push(chunk);
          currentGroupTokens += chunkTokens;
        }
      }

      // Process final group if any
      if (currentGroup.length > 0) {
        setStatus('Processing final group...');
        console.log('Processing final group...');
        const finalGroupResponse = await retryWithBackoff(async () => {
          return await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "You are a highly skilled assistant trained to combine text chunks into a coherent document."
              },
              {
                role: "user",
                content: `Combine these chunks into a coherent section:

${currentGroup.join('\n\n')}`
              }
            ],
            temperature: 0.3,
            max_tokens: 400
          });
        });

        const finalGroupContent = finalGroupResponse.choices[0]?.message?.content;
        if (finalGroupContent) {
          combinedChunks.push(finalGroupContent);
          console.log('Successfully processed final group');
        }
      }

      setStatus('Creating final document...');
      setProgress(90);
      console.log('Starting final combination...');

      // Final combination of all processed sections
      const finalResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a highly skilled assistant trained to create a final, well-organized document from processed sections."
            },
            {
              role: "user",
              content: `Create a final document from these processed sections:
1. Remove any remaining duplicates
2. Ensure smooth transitions between sections
3. Maintain consistent formatting
4. Preserve all medical terminology
5. Organize content logically

Sections to combine:

${combinedChunks.join('\n\n')}`
            }
          ],
          temperature: 0.3,
          max_tokens: 600
        });
      });

      const finalContent = finalResponse.choices[0]?.message?.content;
      if (!finalContent) {
        throw new Error('No content received from final API call');
      }

      console.log('Successfully created final document');
      setProgress(100);
      setStatus('Processing complete!');
      onProcessedNotes(finalContent);
    } catch (err) {
      console.error('Processing error:', err);
      let errorMessage = 'Failed to process notes';
      
      if (err instanceof Error) {
        if (err.message.includes('401')) {
          errorMessage = 'Invalid API key. Please check your API key and try again.';
        } else if (err.message.includes('429')) {
          errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
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

      {isLoading && (
        <VStack spacing={2} align="stretch">
          <Progress value={progress} size="sm" colorScheme="blue" />
          <Text fontSize="sm" color="gray.600">
            {status}
          </Text>
        </VStack>
      )}
    </VStack>
  );
};

export default NotesProcessor; 