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

  // Helper function to process a single chunk
  const processChunk = async (
    chunk: string,
    index: number,
    totalChunks: number,
    openai: OpenAI
  ): Promise<string> => {
    setStatus(`Processing chunk ${index + 1} of ${totalChunks}...`);
    setProgress((index / totalChunks) * 30);

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a highly skilled medical note organizer. Your task is to process this text chunk while preserving all medical information and organizing it professionally."
        },
        {
          role: "user",
          content: `Process this chunk of text following these guidelines:
1. Organize information in clear bullet points
2. Group related items together
3. Fix any grammar, spelling, or formatting issues
4. Preserve ALL information and nuances - do not remove or summarize unless explicitly redundant
5. Use clear headings and subheadings where helpful
6. Maintain professional medical terminology
7. Keep the output suitable for formal documentation

Text to process:

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
    return content;
  };

  // Helper function to process chunks in parallel with concurrency control
  const processChunksInParallel = async (
    chunks: string[],
    openai: OpenAI,
    concurrencyLimit: number = 10
  ): Promise<string[]> => {
    const results: string[] = new Array(chunks.length);
    let currentIndex = 0;
    let activePromises = 0;
    let currentMinuteTokens = 0;
    const TOKEN_LIMIT_PER_MINUTE = 8000;
    const TOKEN_BUFFER = 1000; // Buffer to prevent hitting limit exactly

    const processNextChunk = async (): Promise<void> => {
      if (currentIndex >= chunks.length) return;

      const index = currentIndex++;
      const chunk = chunks[index];
      const estimatedTokens = estimateTokens(chunk);

      // More conservative token limit check for higher concurrency
      if (currentMinuteTokens + estimatedTokens > (TOKEN_LIMIT_PER_MINUTE - TOKEN_BUFFER)) {
        console.log('Token limit approaching, waiting for 60 seconds...');
        setStatus('Token limit approaching, waiting for 60 seconds...');
        await wait(60000);
        currentMinuteTokens = 0;
      }

      try {
        const result = await processChunk(chunk, index, chunks.length, openai);
        results[index] = result;
        currentMinuteTokens += estimatedTokens;
        console.log(`Successfully processed chunk ${index + 1}`);
      } catch (error) {
        console.error(`Error processing chunk ${index + 1}:`, error);
        throw error;
      }

      activePromises--;
      if (currentIndex < chunks.length) {
        activePromises++;
        await processNextChunk();
      }
    };

    // Start initial batch of promises
    const initialPromises = Array(Math.min(concurrencyLimit, chunks.length))
      .fill(null)
      .map(() => {
        activePromises++;
        return processNextChunk();
      });

    await Promise.all(initialPromises);
    return results;
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

      // Split text into chunks
      const chunks = splitTextIntoChunks(rawNotes, 300);
      console.log(`Split text into ${chunks.length} chunks`);
      setStatus(`Processing ${chunks.length} chunks in parallel (10 at a time)...`);

      // Process chunks in parallel with increased concurrency
      const processedChunks = await processChunksInParallel(chunks, openai, 10);

      setStatus('Combining processed chunks...');
      console.log('Starting chunk combination...');

      // Combine chunks in smaller groups
      const combinedChunks: string[] = [];
      let currentGroup: string[] = [];
      let currentGroupTokens = 0;
      const totalGroups = Math.ceil(processedChunks.length / 5);
      let currentGroupIndex = 0;

      for (let i = 0; i < processedChunks.length; i++) {
        const chunk = processedChunks[i];
        const chunkTokens = estimateTokens(chunk);
        
        setProgress(30 + (currentGroupIndex / totalGroups) * 30);
        setStatus(`Combining chunks into sections (${currentGroupIndex + 1}/${totalGroups})...`);

        if (currentGroupTokens + chunkTokens > 2000) {
          console.log(`Processing group ${currentGroupIndex + 1}...`);
          const groupResponse = await retryWithBackoff(async () => {
            return await openai.chat.completions.create({
              model: "gpt-4",
              messages: [
                {
                  role: "system",
                  content: "You are a highly skilled medical note organizer. Your task is to combine these chunks into a coherent section while maintaining professional organization and preserving all details."
                },
                {
                  role: "user",
                  content: `Combine these chunks into a coherent section following these guidelines:
1. Organize information in clear bullet points
2. Group related items together
3. Fix any grammar, spelling, or formatting issues
4. Preserve ALL information and nuances - do not add, remove or summarize unless explicitly redundant
5. Use clear headings and subheadings where helpful
6. Maintain professional medical terminology
7. Keep the output suitable for formal documentation

Chunks to combine:

${currentGroup.join('\n\n')}`
                }
              ],
              temperature: 0.3,
              max_tokens: 500
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
                content: "You are a highly skilled medical note organizer. Your task is to combine these chunks into a coherent section while maintaining professional organization and preserving all details."
              },
              {
                role: "user",
                content: `Combine these chunks into a coherent section following these guidelines:
1. Organize information in clear bullet points
2. Group related items together
3. Fix any grammar, spelling, or formatting issues
4. Preserve ALL information and nuances - do not add, remove or summarize unless explicitly redundant
5. Use clear headings and subheadings where helpful
6. Maintain professional medical terminology
7. Keep the output suitable for formal documentation

Chunks to combine:

${currentGroup.join('\n\n')}`
              }
            ],
            temperature: 0.3,
            max_tokens: 500
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

      // Final combination
      const finalResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a highly skilled medical note organizer. Your task is to create a final, well-organized document from these processed sections while maintaining professional standards and preserving all details."
            },
            {
              role: "user",
              content: `Create a final document from these processed sections following these guidelines:
1. Organize information in clear bullet points
2. Group related items together
3. Fix any grammar, spelling, or formatting issues
4. Preserve ALL information and nuances - do not add, remove or summarize unless explicitly redundant
5. Use clear headings and subheadings where helpful
6. Maintain professional medical terminology
7. Keep the output suitable for formal documentation
8. Ensure smooth transitions between sections
9. Remove any remaining duplicates
10. Maintain consistent formatting throughout

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