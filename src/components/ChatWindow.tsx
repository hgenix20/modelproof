import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { CrossModelRAGAgent } from '../agents/CrossModelRAGAgent';
import { RiskAuditorAgent } from '../agents/RiskAuditorAgent';
import { AuditResult } from '../agents/RiskAuditorAgent';
import { config } from '../config';
import { RateLimitError, queryHuggingFaceModel } from '../utils/modelFallback';

/**
 * Represents a message in the chat conversation.
 * @interface Message
 * @property {'user' | 'assistant'} role - The sender of the message
 * @property {string} content - The message content
 * @property {string} [model] - The AI model used to generate the response
 * @property {string} [error] - Error message if the response failed
 */
interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  error?: string;
}

/**
 * Props for the ChatWindow component.
 * @interface ChatWindowProps
 * @property {(result: AuditResult) => void} onAuditUpdate - Callback when audit results are available
 * @property {() => void} onAnalysisStart - Callback when analysis begins
 * @property {(error: string) => void} [onAuditError] - Callback for audit errors
 * @property {(type: 'hallucination' | 'bias' | 'toxicity' | 'intent_alignment') => void} [onAuditProgress] - Callback for audit progress updates
 */
interface ChatWindowProps {
  onAuditUpdate: (result: AuditResult) => void;
  onAnalysisStart: () => void;
  onAuditError?: (error: string) => void;
  onAuditProgress?: (type: 'hallucination' | 'bias' | 'toxicity' | 'intent_alignment') => void;
}

/**
 * A React component that provides a chat interface for interacting with AI models.
 * Handles message input, display, and automatic security auditing of responses.
 * Supports fallback to alternative models when rate limits are encountered.
 * 
 * @component
 * @param {ChatWindowProps} props - Component props
 * @returns {JSX.Element} The rendered chat window
 * 
 * @example
 * <ChatWindow
 *   onAuditUpdate={(result) => console.log(result)}
 *   onAnalysisStart={() => console.log('Analysis started')}
 *   onAuditError={(error) => console.error(error)}
 *   onAuditProgress={(type) => console.log(`Progress: ${type}`)}
 * />
 */
export function ChatWindow({ onAuditUpdate, onAnalysisStart, onAuditError = () => {}, onAuditProgress }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastAuditTime, setLastAuditTime] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      const agent = new CrossModelRAGAgent({
        primaryLLM: {
          apiKey: config.githubToken,
          endpoint: config.endpoints.github,
          model: config.models.MAI.github,
          temperature: 0.7,
        },
        secondaryLLM: {
          apiKey: config.githubToken,
          endpoint: config.endpoints.github,
          model: config.models.openai.github,
          temperature: 0.7,
        },
        similarityThreshold: 0.8,
      });

      const response = await agent.processPrompt(userMessage);
      
      // Manually construct known-good state
      const currentConversation: Message[] = [
        ...messages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response.text, model: response.model }
      ];

      // Update UI with the complete conversation
      setMessages(currentConversation);

      // Run audit in background after response is displayed
      setTimeout(async () => {
        try {
          const now = Date.now();
          const timeSinceLastAudit = now - lastAuditTime;
          const minDelay = 5000;
          
          if (timeSinceLastAudit < minDelay) {
            const delay = minDelay - timeSinceLastAudit;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          onAnalysisStart();
          const auditAgent = new RiskAuditorAgent();
          const auditResult = await auditAgent.auditChat(currentConversation, onAuditProgress);
          setLastAuditTime(Date.now());
          onAuditUpdate(auditResult);
        } catch (error) {
          console.error('Error during audit:', error);
          onAuditError(error instanceof Error ? error.message : 'Failed to complete audit');
        }
      }, 0);

    } catch (error) {
      if (error instanceof RateLimitError) {
        // Try with Hugging Face model
        try {
          const huggingfaceResponse = await queryHuggingFaceModel(
            'MAI',
            'You are a helpful AI assistant.',
            userMessage,
            (token) => {
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...lastMessage, content: lastMessage.content + token }];
                }
                return prev;
              });
            }
          );
          
          // Update conversation state for Hugging Face response
          const currentConversation: Message[] = [
            ...messages,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: huggingfaceResponse.content, model: huggingfaceResponse.model }
          ];
          setMessages(currentConversation);

          // Run audit for Hugging Face response
          setTimeout(async () => {
            try {
              onAnalysisStart();
              const auditAgent = new RiskAuditorAgent();
              const auditResult = await auditAgent.auditChat(currentConversation, onAuditProgress);
              setLastAuditTime(Date.now());
              onAuditUpdate(auditResult);
            } catch (error) {
              console.error('Error during audit:', error);
              onAuditError(error instanceof Error ? error.message : 'Failed to complete audit');
            }
          }, 0);
        } catch (hfError) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Error: Failed to get response from both GitHub and Hugging Face models.',
            error: hfError instanceof Error ? hfError.message : 'Unknown error'
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Error: Failed to process your request.',
          error: error instanceof Error ? error.message : 'Unknown error'
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.error
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="relative">
                <div className="prose prose-sm md:prose-base lg:prose-lg max-w-none dark:prose-invert">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                {message.model && (
                  <div className="absolute -top-6 right-0 text-xs text-gray-500">
                    {message.model}
                  </div>
                )}
                {message.error && (
                  <div className="text-xs text-red-600 mt-2">
                    {message.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 rounded-lg p-4">
              <div className="animate-pulse">Thinking...</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your question or request..."
            disabled={isLoading}
            className="flex-1 p-2 border rounded-lg bg-black text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isLoading ? 'Processing...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
} 