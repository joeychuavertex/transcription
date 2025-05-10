import React, { useState } from 'react';
import {
  Box,
  VStack,
  Heading,
  Container,
  useColorModeValue,
} from '@chakra-ui/react';
import FileUpload from './components/FileUpload';
import TranscriptionView from './components/TranscriptionView';

function App() {
  const [transcription, setTranscription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const headingColor = useColorModeValue('blue.600', 'blue.300');

  const handleTranscription = (text: string) => {
    setTranscription(text);
  };

  return (
    <Box minH="100vh" bg={bgColor} py={8}>
      <Container maxW="container.lg">
        <VStack gap={8} align="stretch">
          <Heading 
            textAlign="center" 
            color={headingColor}
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="bold"
          >
            Audio Transcription & Notes
          </Heading>
          <FileUpload
            onTranscription={handleTranscription}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
          {transcription && (
            <TranscriptionView transcription={transcription} />
          )}
        </VStack>
      </Container>
    </Box>
  );
}

export default App;
