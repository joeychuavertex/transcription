import React from 'react';
import {
  Box,
  Heading,
  Text,
  Badge,
  useColorModeValue,
  Button,
  useToast,
} from '@chakra-ui/react';
import { CopyIcon } from '@chakra-ui/icons';

interface TranscriptionViewProps {
  transcription: string;
}

const TranscriptionView: React.FC<TranscriptionViewProps> = ({ transcription }) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const toast = useToast();

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
    <Box 
      bg={bgColor} 
      p={6} 
      borderRadius="md" 
      boxShadow="sm"
      border="1px solid"
      borderColor={borderColor}
    >
      <Heading size="md" mb={4} display="flex" alignItems="center" gap={2}>
        Transcription
        <Badge colorScheme="blue" fontSize="sm">Raw Text</Badge>
        <Button
          size="sm"
          leftIcon={<CopyIcon />}
          onClick={() => copyToClipboard(transcription)}
          ml="auto"
        >
          Copy
        </Button>
      </Heading>
      <Text whiteSpace="pre-wrap" fontSize="md" lineHeight="tall">
        {transcription}
      </Text>
    </Box>
  );
};

export default TranscriptionView; 