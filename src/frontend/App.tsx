import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { elizaClient } from './lib/elizaClient';
import { socketManager } from './lib/socketManager';
import { ChatInterface } from './components/chat/chat-interface';
import SmallChat from './components/chat';
import { SidebarProvider } from './components/ui/sidebar';
import { DashboardSidebar } from './components/dashboard/sidebar';
import Widget from './components/dashboard/widget';
import Notifications from './components/dashboard/notifications';
import { MobileChat } from './components/chat/mobile-chat';
import { MobileHeader } from './components/dashboard/mobile-header';
import { MessageSquare } from 'lucide-react';
import { Bullet } from './components/ui/bullet';
import mockDataJson from './mock.json';
import type { MockData } from './types/dashboard';

const mockData = mockDataJson as MockData;
const DEFAULT_SERVER_ID = '00000000-0000-0000-0000-000000000000';

// Generate a proper UUID for the user (required by server validation)
function getUserId(): string {
  const existingId = localStorage.getItem('eliza-user-id');
  if (existingId) {
    return existingId;
  }
  
  const userId = crypto.randomUUID();
  localStorage.setItem('eliza-user-id', userId);
  return userId;
}

const USER_ID = getUserId();

interface Channel {
  id: string;
  name: string;
  createdAt?: number;
  lastMessageAt?: number;
}

function App() {
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Fetch the agent list first to get the ID
  const { data: agentsData } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const result = await elizaClient.agents.listAgents();
      return result.agents;
    },
    refetchInterval: 10000,
  });

  const agentId = agentsData?.[0]?.id;

  // Fetch full agent details (including settings with avatar)
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      if (!agentId) return null;
      return await elizaClient.agents.getAgent(agentId);
    },
    enabled: !!agentId,
    refetchInterval: 10000,
  });

  // Connect to socket
  useEffect(() => {
    const socket = socketManager.connect(USER_ID);
    
    socket.on('connect', () => {
      setConnected(true);
      console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from server');
    });

    return () => {
      socketManager.disconnect();
    };
  }, []);

  // Load channels
  useEffect(() => {
    async function loadChannels() {
      if (!agent?.id || !USER_ID) return;

      setIsLoadingChannels(true);
      try {
        console.log('📂 Loading all DM channels for agent:', agent.id);
        console.log('👤 User ID:', USER_ID);
        const response = await elizaClient.messaging.getServerChannels(DEFAULT_SERVER_ID as any);
        console.log(`📊 Total channels from server: ${response.channels.length}`);
        const dmChannels = await Promise.all(
          response.channels
            .filter((ch: any) => {
              if (ch.type !== 'DM') return false;
              
              // Check participants in metadata
              const participants = ch.metadata?.participantCentralUserIds;
              if (participants && Array.isArray(participants)) {
                return participants.includes(agent.id) && participants.includes(USER_ID);
              }
              
              // Fallback: check if it's marked as a DM for this agent
              const isForAgent = ch.metadata?.forAgent === agent.id || ch.metadata?.agentId === agent.id;
              const isForUser = ch.metadata?.user1 === USER_ID || ch.metadata?.user2 === USER_ID;
              
              return isForAgent && isForUser;
            })
            .map(async (ch: any) => {
              let createdAt = 0;
              if (ch.createdAt instanceof Date) {
                createdAt = ch.createdAt.getTime();
              } else if (typeof ch.createdAt === 'number') {
                createdAt = ch.createdAt;
              } else if (typeof ch.createdAt === 'string') {
                createdAt = Date.parse(ch.createdAt);
              } else if (ch.metadata?.createdAt) {
                // Try metadata.createdAt as fallback
                if (typeof ch.metadata.createdAt === 'string') {
                  createdAt = Date.parse(ch.metadata.createdAt);
                } else if (typeof ch.metadata.createdAt === 'number') {
                  createdAt = ch.metadata.createdAt;
                }
              }

              let lastMessageAt = 0;
              try {
                const msgs = await elizaClient.messaging.getChannelMessages(ch.id, { limit: 1 });
                if (msgs.messages.length > 0) {
                  const msg = msgs.messages[0];
                  if (msg.createdAt instanceof Date) {
                    lastMessageAt = msg.createdAt.getTime();
                  } else if (typeof msg.createdAt === 'number') {
                    lastMessageAt = msg.createdAt;
                  } else if (typeof msg.createdAt === 'string') {
                    lastMessageAt = Date.parse(msg.createdAt);
                  }
                }
              } catch (err) {
                console.warn(`Could not load last message for channel ${ch.id}`);
              }

              return {
                id: ch.id,
                name: ch.name || `Chat ${ch.id.substring(0, 8)}`,
                createdAt: createdAt || Date.now(),
                lastMessageAt,
              };
            })
        );

        const sortedChannels = dmChannels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setChannels(sortedChannels);
        
        console.log(`✅ Loaded ${sortedChannels.length} DM channels (sorted by creation time)`);
        sortedChannels.forEach((ch, i) => {
          const createdDate = ch.createdAt ? new Date(ch.createdAt).toLocaleString() : 'Unknown';
          console.log(`  ${i + 1}. ${ch.name} (${ch.id.substring(0, 8)}...) - Created: ${createdDate}`);
        });
        
        // If no channels exist, create one automatically
        if (sortedChannels.length === 0 && !hasInitialized.current) {
          console.log('📝 No channels found, creating default channel...');
          hasInitialized.current = true;
          
          // Create default channel
          const timestamp = new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const channelName = `Chat - ${timestamp}`;
          const now = Date.now();
          
          try {
            const newChannel = await elizaClient.messaging.createGroupChannel({
              name: channelName,
              participantIds: [USER_ID as any, agent.id as any],
              metadata: {
                type: 'DM',
                isDm: true,
                user1: USER_ID,
                user2: agent.id,
                forAgent: agent.id,
                createdAt: new Date(now).toISOString(),
              },
            });
            
            const newChannelData = {
              id: newChannel.id,
              name: newChannel.name,
              createdAt: now,
              lastMessageAt: 0,
            };
            
            setChannels([newChannelData]);
            setActiveChannelId(newChannel.id);
            console.log('✅ Default channel created:', newChannel.id);
          } catch (error: any) {
            console.error('❌ Failed to create default channel:', error);
          }
        } else if (sortedChannels.length > 0 && !activeChannelId && !hasInitialized.current) {
          // Set first channel as active if we have channels
          setActiveChannelId(sortedChannels[0].id);
          hasInitialized.current = true;
        }
      } catch (error: any) {
        console.warn('⚠️ Could not load channels:', error.message);
      } finally {
        setIsLoadingChannels(false);
      }
    }

    loadChannels();
  }, [agent?.id, USER_ID]);

  const handleNewChat = async () => {
    if (isCreatingChannel || !agent?.id || !USER_ID) return;

    setIsCreatingChannel(true);
    try {
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const channelName = `Chat - ${timestamp}`;

      const now = Date.now();
      const newChannel = await elizaClient.messaging.createGroupChannel({
        name: channelName,
        participantIds: [USER_ID as any, agent.id as any],
        metadata: {
          type: 'DM',
          isDm: true,
          user1: USER_ID,
          user2: agent.id,
          forAgent: agent.id,
          createdAt: new Date(now).toISOString(),
        },
      });

      setChannels((prev) => [
        {
          id: newChannel.id,
          name: newChannel.name,
          createdAt: now,
          lastMessageAt: 0,
        },
        ...prev,
      ]);

      setActiveChannelId(newChannel.id);
    } catch (error: any) {
      console.error('❌ Failed to create new chat:', error);
    } finally {
      setIsCreatingChannel(false);
    }
  };

  const handleChannelSelect = async (newChannelId: string) => {
    if (newChannelId === activeChannelId) return;

    if (activeChannelId) {
      socketManager.leaveChannel(activeChannelId);
    }

    setActiveChannelId(newChannelId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground uppercase tracking-wider text-sm font-mono">
            Loading agent...
          </p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-foreground font-mono uppercase tracking-wider">No agent available</p>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            Please start the server with an agent configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      {/* Mobile Header */}
      <MobileHeader mockData={mockData} />

      {/* Desktop Layout - 3 columns */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-gap lg:px-sides">
        {/* Left Sidebar - Chat History */}
        <div className="hidden lg:block col-span-2 top-0 relative">
          <DashboardSidebar
            channels={channels}
            activeChannelId={activeChannelId}
            onChannelSelect={handleChannelSelect}
            onNewChat={handleNewChat}
            isCreatingChannel={isCreatingChannel}
            agentName={agent.name}
            agentAvatar={agent.settings?.avatar as string | undefined}
          />
        </div>

        {/* Center - Chat Interface */}
        <div className="col-span-1 lg:col-span-7">
          <div className="flex flex-col relative w-full gap-1 min-h-full">
            {/* Header */}
            <div className="flex items-center lg:items-baseline gap-2.5 md:gap-4 px-4 md:px-6 py-3 md:pb-4 lg:pt-7 ring-2 ring-pop sticky top-header-mobile lg:top-0 bg-background z-10">
              <div className="max-lg:contents rounded bg-primary size-7 md:size-9 flex items-center justify-center my-auto">
                <MessageSquare className="ml-1 lg:ml-0 opacity-50 md:opacity-100 size-5" />
              </div>
              <h1 className="text-xl lg:text-4xl font-display leading-[1] mb-1">
                AI Chat
              </h1>
              <span className="ml-auto text-xs md:text-sm text-muted-foreground block">
                Communicate with advanced language models
              </span>
            </div>
            
            {/* Content Area */}
            <div className="min-h-full flex-1 flex flex-col gap-8 md:gap-14 px-3 lg:px-6 py-6 md:py-10 ring-2 ring-pop bg-background">
              {isLoadingChannels || !activeChannelId ? (
                <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground uppercase tracking-wider text-sm font-mono">
                      {isLoadingChannels ? 'Loading channels...' : 'Select a chat'}
                    </p>
                  </div>
                </div>
              ) : (
                <ChatInterface
                  agent={agent}
                  userId={USER_ID}
                  serverId={DEFAULT_SERVER_ID}
                  channelId={activeChannelId}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Widget, Notifications, Small Chat */}
        <div className="col-span-3 hidden lg:block">
          <div className="space-y-gap py-sides min-h-screen max-h-screen sticky top-0 overflow-clip">
            <Widget widgetData={mockData.widgetData} />
            <Notifications initialNotifications={mockData.notifications} />
            <SmallChat />
          </div>
        </div>
      </div>

      {/* Mobile Chat */}
      <MobileChat />
    </SidebarProvider>
  );
}

export default App;
