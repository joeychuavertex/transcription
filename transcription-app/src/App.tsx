import React, { useState } from 'react';
import {
  Box,
  VStack,
  Heading,
  Container,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Input,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import FileUpload from './components/FileUpload';
import TranscriptionView from './components/TranscriptionView';
import NotesProcessor from './components/NotesProcessor';

function App() {
  const [transcription, setTranscription] = useState('');
  const [processedNotes, setProcessedNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const headingColor = useColorModeValue('blue.600', 'blue.300');

  const handleTranscription = (text: string) => {
    setTranscription(text);
  };

  const handleProcessedNotes = (text: string) => {
    setProcessedNotes(text);
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

          <FormControl>
            <FormLabel>OpenAI API Key</FormLabel>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your OpenAI API key"
            />
          </FormControl>
          
          <Tabs isFitted variant="enclosed">
            <TabList mb="1em">
              <Tab>Audio Transcription</Tab>
              <Tab>Notes Processing</Tab>
            </TabList>

            <TabPanels>
              <TabPanel>
                <FileUpload
                  onTranscription={handleTranscription}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  apiKey={apiKey}
                />
                {transcription && (
                  <TranscriptionView transcription={transcription} />
                )}
              </TabPanel>
              
              <TabPanel>
                <NotesProcessor
                  onProcessedNotes={handleProcessedNotes}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  apiKey={apiKey}
                />
                {processedNotes && (
                  <TranscriptionView transcription={processedNotes} />
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </VStack>
      </Container>
    </Box>
  );
}

export default App;
