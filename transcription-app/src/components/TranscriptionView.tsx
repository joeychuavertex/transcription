import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  Heading,
  Text,
  List,
  ListItem,
  Badge,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Button,
  Input,
  useToast,
} from '@chakra-ui/react';
import { CheckCircleIcon, TimeIcon, StarIcon, CopyIcon } from '@chakra-ui/icons';
import OpenAI from 'openai';

interface TranscriptionViewProps {
  transcription: string;
}

interface NoteItem {
  text: string;
  type: 'follow-up' | 'action' | 'note';
}

const TranscriptionView: React.FC<TranscriptionViewProps> = ({ transcription }) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedNotes, setProcessedNotes] = useState<NoteItem[]>([]);
  const [apiKey, setApiKey] = useState('');
  const toast = useToast();

  const { mainText, notes } = useMemo(() => {
    const lines = transcription.split('\n');
    const notes: NoteItem[] = [];
    const mainTextLines: string[] = [];

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.match(/^[-*•]|\d+\./)) {
        // Determine note type based on content
        let type: NoteItem['type'] = 'note';
        if (trimmedLine.toLowerCase().includes('follow up') || 
            trimmedLine.toLowerCase().includes('follow-up')) {
          type = 'follow-up';
        } else if (trimmedLine.toLowerCase().includes('action') || 
                  trimmedLine.toLowerCase().includes('todo') ||
                  trimmedLine.toLowerCase().includes('to do')) {
          type = 'action';
        }
        notes.push({ text: trimmedLine, type });
      } else {
        mainTextLines.push(line);
      }
    });

    return {
      mainText: mainTextLines.join('\n').trim(),
      notes
    };
  }, [transcription]);

  const processWithGPT4 = async () => {
    if (!apiKey) {
      toast({
        title: 'API Key Required',
        description: 'Please enter your OpenAI API key to process notes',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsProcessing(true);
      const openai = new OpenAI({ 
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const prompt = `Please analyze the following transcription and create organized notes with the following structure:
1. Key Points (bullet points of main topics discussed)
2. Action Items (tasks that need to be done)
3. Follow-ups (items that need follow-up or discussion)

Transcription:
${mainText}

Please format the response as follows:
KEY POINTS:
- [point 1]
- [point 2]

ACTION ITEMS:
- [action 1]
- [action 2]

FOLLOW-UPS:
- [follow-up 1]
- [follow-up 2]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a professional note-taker who creates clear, organized notes from transcriptions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
      });

      const processedText = response.choices[0].message.content || '';
      const newNotes: NoteItem[] = [];

      // Parse the GPT-4 response
      const sections = processedText.split('\n\n');
      sections.forEach(section => {
        if (section.startsWith('KEY POINTS:')) {
          section.split('\n').slice(1).forEach(point => {
            if (point.trim().startsWith('-')) {
              newNotes.push({ text: point.trim(), type: 'note' });
            }
          });
        } else if (section.startsWith('ACTION ITEMS:')) {
          section.split('\n').slice(1).forEach(item => {
            if (item.trim().startsWith('-')) {
              newNotes.push({ text: item.trim(), type: 'action' });
            }
          });
        } else if (section.startsWith('FOLLOW-UPS:')) {
          section.split('\n').slice(1).forEach(item => {
            if (item.trim().startsWith('-')) {
              newNotes.push({ text: item.trim(), type: 'follow-up' });
            }
          });
        }
      });

      setProcessedNotes(newNotes);
      toast({
        title: 'Success',
        description: 'Notes processed successfully',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error processing notes:', error);
      toast({
        title: 'Error',
        description: 'Failed to process notes. Please check your API key and try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getNoteIcon = (type: NoteItem['type']) => {
    switch (type) {
      case 'follow-up':
        return <TimeIcon color="orange.500" />;
      case 'action':
        return <CheckCircleIcon color="green.500" />;
      default:
        return <StarIcon color="blue.500" />;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Text copied to clipboard',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  return (
    <Tabs variant="enclosed" colorScheme="blue">
      <TabList>
        <Tab>Transcription</Tab>
        <Tab>Notes & Follow-ups</Tab>
      </TabList>

      <TabPanels>
        <TabPanel>
          <Box 
            bg={bgColor} 
            p={6} 
            borderRadius="md" 
            boxShadow="sm"
            border="1px solid"
            borderColor={borderColor}
          >
            <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
              Full Transcription
              <Badge colorScheme="blue" fontSize="sm">Raw Text</Badge>
              <Button
                size="sm"
                leftIcon={<CopyIcon />}
                onClick={() => copyToClipboard(mainText)}
                ml="auto"
              >
                Copy
              </Button>
            </Heading>
            <Text whiteSpace="pre-wrap" fontSize="md" lineHeight="tall">
              {mainText}
            </Text>
          </Box>
        </TabPanel>

        <TabPanel>
          <VStack gap={6} align="stretch">
            <Box 
              bg={bgColor} 
              p={6} 
              borderRadius="md" 
              boxShadow="sm"
              border="1px solid"
              borderColor={borderColor}
            >
              <VStack align="stretch" spacing={4}>
                <Heading size="md">Process with GPT-4</Heading>
                <Input
                  placeholder="Enter your OpenAI API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  type="password"
                />
                <Button
                  colorScheme="blue"
                  onClick={processWithGPT4}
                  isLoading={isProcessing}
                  loadingText="Processing..."
                >
                  Generate Organized Notes
                </Button>
              </VStack>
            </Box>

            {(processedNotes.length > 0 || notes.length > 0) && (
              <>
                {['note', 'action', 'follow-up'].map(type => {
                  const typeNotes = [...(processedNotes.length > 0 ? processedNotes : notes)]
                    .filter(note => note.type === type);
                  if (typeNotes.length === 0) return null;

                  return (
                    <Box 
                      key={type}
                      bg={bgColor} 
                      p={6} 
                      borderRadius="md" 
                      boxShadow="sm"
                      border="1px solid"
                      borderColor={borderColor}
                    >
                      <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
                        {type === 'follow-up' ? 'Follow-ups' : 
                         type === 'action' ? 'Action Items' : 'Key Points'}
                        <Badge colorScheme={
                          type === 'follow-up' ? 'orange' :
                          type === 'action' ? 'green' : 'blue'
                        } fontSize="sm">
                          {typeNotes.length} items
                        </Badge>
                        <Button
                          size="sm"
                          leftIcon={<CopyIcon />}
                          onClick={() => copyToClipboard(typeNotes.map(n => n.text).join('\n'))}
                          ml="auto"
                        >
                          Copy All
                        </Button>
                      </Heading>
                      <List spacing={3}>
                        {typeNotes.map((note, index) => (
                          <ListItem 
                            key={index} 
                            display="flex" 
                            alignItems="flex-start" 
                            gap={3}
                            p={2}
                            borderRadius="md"
                            _hover={{ bg: 'gray.50' }}
                          >
                            {getNoteIcon(note.type)}
                            <Text>{note.text}</Text>
                            <Button
                              size="xs"
                              leftIcon={<CopyIcon />}
                              onClick={() => copyToClipboard(note.text)}
                              ml="auto"
                            >
                              Copy
                            </Button>
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  );
                })}
              </>
            )}
          </VStack>
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
};

export default TranscriptionView; 