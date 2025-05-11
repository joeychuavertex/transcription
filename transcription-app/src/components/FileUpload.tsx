import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  VStack,
  Text,
  Spinner,
  useToast,
  Progress,
} from '@chakra-ui/react';
import OpenAI from 'openai';

interface FileUploadProps {
  onTranscription: (text: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  apiKey: string;
}

// Reduce chunk size to 5MB for more precise handling
const CHUNK_SIZE = 5 * 1024 * 1024;
// Increase overlap to 15 seconds for better context
const OVERLAP_DURATION = 15; // seconds

const FileUpload: React.FC<FileUploadProps> = ({
  onTranscription,
  isLoading,
  setIsLoading,
  apiKey,
}) => {
  const [progress, setProgress] = useState(0);
  const toast = useToast();

  const splitAudioFile = async (file: File): Promise<File[]> => {
    const chunks: File[] = [];
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      // Calculate overlap for better context
      const overlapSize = OVERLAP_DURATION * 1024 * 1024; // Convert seconds to bytes
      const start = Math.max(0, i * CHUNK_SIZE - (i > 0 ? overlapSize : 0));
      const end = Math.min(file.size, (i + 1) * CHUNK_SIZE + (i < totalChunks - 1 ? overlapSize : 0));
      const chunk = file.slice(start, end);
      chunks.push(new File([chunk], `chunk_${i}.m4a`, { type: 'audio/m4a' }));
    }
    
    return chunks;
  };

  const transcribeChunk = async (openai: OpenAI, chunk: File, index: number, totalChunks: number): Promise<string> => {
    try {
      const response = await openai.audio.transcriptions.create({
        file: chunk,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
        prompt: index === 0 ? "This is the beginning of the audio." : 
                index === totalChunks - 1 ? "This is the end of the audio." :
                "This is a continuation of the previous audio segment. Do not repeat any content from the previous segment."
      });
      return response;
    } catch (error) {
      console.error(`Error transcribing chunk ${index}:`, error);
      throw error;
    }
  };

  const mergeTranscriptions = (transcriptions: string[]): string => {
    return transcriptions
      .map((text, index) => {
        if (index === 0) return text.trim();

        const prevText = transcriptions[index - 1];
        const currentText = text.trim();
        
        // Find the last complete sentence in the previous chunk
        const lastSentences = prevText.split(/[.!?]/).filter(s => s.trim().length > 0);
        const lastSentence = lastSentences[lastSentences.length - 1]?.trim() || '';
        
        if (!lastSentence) return currentText;

        // Find potential overlap points
        const overlapPoints = findOverlapPoints(lastSentence, currentText);
        
        if (overlapPoints.length > 0) {
          // Use the longest overlap point to ensure we don't cut in the middle of a sentence
          const bestOverlap = overlapPoints.reduce((a, b) => a.length > b.length ? a : b);
          const overlapIndex = currentText.toLowerCase().indexOf(bestOverlap.toLowerCase());
          
          if (overlapIndex >= 0 && overlapIndex < currentText.length / 2) {
            return currentText.substring(overlapIndex + bestOverlap.length).trim();
          }
        }
        
        return currentText;
      })
      .filter(text => text.length > 0)
      .join('\n\n');
  };

  const findOverlapPoints = (lastSentence: string, currentText: string): string[] => {
    const overlapPoints: string[] = [];
    const words = lastSentence.split(/\s+/);
    
    // Look for overlapping phrases of different lengths
    for (let i = words.length; i >= 3; i--) {
      const phrase = words.slice(-i).join(' ');
      if (currentText.toLowerCase().includes(phrase.toLowerCase())) {
        overlapPoints.push(phrase);
      }
    }
    
    return overlapPoints;
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!apiKey) {
        toast({
          title: 'API Key Required',
          description: 'Please enter your OpenAI API key first',
          status: 'warning',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      const file = acceptedFiles[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.m4a')) {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload an M4A file',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      try {
        setIsLoading(true);
        setProgress(0);
        const openai = new OpenAI({ 
          apiKey,
          dangerouslyAllowBrowser: true
        });

        // Split the file into smaller chunks
        const chunks = await splitAudioFile(file);
        const totalChunks = chunks.length;
        
        // Transcribe each chunk with progress tracking
        const transcriptions: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunkTranscription = await transcribeChunk(openai, chunks[i], i, totalChunks);
          transcriptions.push(chunkTranscription);
          setProgress(((i + 1) / totalChunks) * 100);
        }

        // Merge transcriptions with improved overlap handling
        const fullTranscription = mergeTranscriptions(transcriptions);
        onTranscription(fullTranscription);
        
        toast({
          title: 'Success',
          description: 'Transcription completed successfully',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } catch (error: any) {
        console.error('Transcription error:', error);
        let errorMessage = 'Please check your API key and try again';
        
        if (error.response?.status === 401) {
          errorMessage = 'Invalid API key. Please check your API key and try again.';
        } else if (error.response?.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (error.message?.includes('file')) {
          errorMessage = 'Error processing the audio file. Please ensure it\'s a valid M4A file.';
        }

        toast({
          title: 'Transcription Failed',
          description: errorMessage,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsLoading(false);
        setProgress(0);
      }
    },
    [apiKey, onTranscription, setIsLoading, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/m4a': ['.m4a'],
    },
    multiple: false,
  });

  return (
    <VStack gap={4} align="stretch">
      <Box
        {...getRootProps()}
        p={10}
        border="2px dashed"
        borderColor={isDragActive ? 'blue.400' : 'gray.200'}
        borderRadius="md"
        textAlign="center"
        cursor="pointer"
        bg={isDragActive ? 'blue.50' : 'white'}
        _hover={{ bg: 'gray.50' }}
        transition="all 0.2s"
      >
        <input {...getInputProps()} />
        {isLoading ? (
          <VStack spacing={4}>
            <Spinner size="xl" color="blue.500" />
            <Text>Transcribing audio...</Text>
            <Progress value={progress} width="100%" colorScheme="blue" />
            <Text fontSize="sm">{Math.round(progress)}% complete</Text>
          </VStack>
        ) : (
          <Text fontSize="lg">
            {isDragActive
              ? 'Drop the M4A file here'
              : 'Drag and drop an M4A file here, or click to select'}
          </Text>
        )}
      </Box>
    </VStack>
  );
};

export default FileUpload; 