"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, User, Bot, Maximize2, Minimize2, X } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
}

interface AgentChatInterfaceProps {
    isFullScreen?: boolean;
    onMaximize?: () => void;
    onMinimize?: () => void;
    onClose?: () => void;
}

const CATEGORY_QUESTIONS: Record<string, string[]> = {
    'Member’s Clubs': [
        "What events, places or clubs should I go to, or join, that will help me find the right people to network with?",
        "Interesting founders’ clubs for me?"
    ],
    'Places': [
        "What events or places should I go to that will help me find the right people to network with?",
        "Great date locations?"
    ],
    'Start-up / Investors': [
        "Which investors could I reach out to, that are relevant to my project / start-up?",
        "What accelerators are out there that match the industry and stage of my project / start-up?",
        "How should I structure my pitch deck, to best communicate my specific product / service?",
        "What’s the best business model for my company?",
        "Which VC firms could I contact?"
    ],
    'Services': [
        "What services are out there that will help me get to where I want to be?",
        "Best branding agencies?",
        "How to get my brand mentioned on AI tools like Chat GPT?"
    ],
    'Courses': [
        "What educational courses will teach me the skills I need to attain my vision?",
        "What courses can teach me about vibe coding?",
        "Where can I learn about being mentioned on Chat GPT?",
        "How can I learn to write better AI prompts?"
    ],
    'AI Tools': [
        "What AI tools are out there that I should be using to improve my operational efficiency?",
        "Best automation tools?",
        "How can I make entire movies with AI?"
    ],
    'Career': [
        "What career websites have roles that match my experiences and aspirations?",
        "How should I write my cover letter for the job I want?",
        "Best websites to apply for remote jobs?",
        "What are alternative ways to make money online?"
    ],
    'Films / Inspiration': [
        "Give me some inspiration for my work.",
        "What films should I watch for business motivation?"
    ]
};

import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/components/providers/UserProvider';

export default function AgentChatInterface({ isFullScreen, onMaximize, onMinimize, onClose }: AgentChatInterfaceProps) {
    const { user, loading } = useUser();
    const [messages, setMessages] = useState<Message[]>([]);
    const supabase = createClient();

    const [hasInitialized, setHasInitialized] = useState(false);
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [showVennDiagram, setShowVennDiagram] = useState(false);

    const placeholders = [
        "What is your dream?",
        "Ask about films, courses, or career advice...",
        "Try: 'Recommend inspiring films'",
        "Select a category above for best results!"
    ];

    useEffect(() => {
        const fetchProfileAndSetIntro = async () => {
            if (loading || hasInitialized) return;

            let firstName = 'beautiful';
            let isUserLoggedIn = !!user;

            if (user) {
                try {
                    // Fetch profile to get full_name (as it's in profiles table, not users)
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name')
                        .eq('user_id', user.id)
                        .single();

                    if (profile?.full_name) {
                        firstName = profile.full_name.split(' ')[0];
                    } else if (user.username) {
                        firstName = user.username;
                    }
                } catch (err) {
                    console.error('Error fetching profile:', err);
                    if (user.username) firstName = user.username;
                }
            }

            let introText = '';

            if (isUserLoggedIn) {
                // Logged In Logic
                if (isFullScreen) {
                    introText = `Love your profile ${firstName}… now let’s get your name out there! I’ve been loaded up with a custom database of all the latest AI tools, business strategy, courses, career advice, and services out there. A lot of these resources won’t be found from a normal search engine or AI tool, as they have been gained from sources that LLMs can’t yet reach. We will give you the best wisdom to get you to where and who you want to be, so you can gain the opportunities you deserve. We can’t wait for you to level up in life, and strengthen your nsso profile over time. Check out some of the areas I can help you with below.`;
                } else {
                    // Pop-up
                    introText = `Love your profile ${firstName}… now let’s get your name out there! Check out some of the areas I can help you with below.`;
                }
            } else {
                // Logged Out Logic
                if (isFullScreen) {
                    introText = "Hey beautiful, I’m here to help you feel clear about yourself, your offering and your plan of action. I’ve been loaded up with a custom database of all the latest AI tools, business strategy, courses, career advice, and services out there. A lot of these resources won’t be found from a normal search engine or AI tool, as they have been curated from unique sources by my founder. Copy / paste anything about yourself; your CV, LinkedIn etc. so I can give you more tailored advice. The more you tell me about yourself, the better my advice would be. I recommend that you make a nsso profile so I can do this more effectively. Select a category below or ask me anything to get started.";
                } else {
                    // Pop-up
                    introText = "Hey beautiful, I’m here to help you feel clear about yourself, your offering and your plan of action. Select a category below or ask me anything to get started.";
                }
            }

            const welcomeMessages: Message[] = [
                {
                    id: 'welcome',
                    role: 'model',
                    content: introText,
                    timestamp: Date.now()
                },
                {
                    id: 'tip',
                    role: 'model',
                    content: '💡 Tip: Select a category below (Films, Courses, Career, etc.) for the best recommendations from our curated database!',
                    timestamp: Date.now() + 1
                }
            ];
            setMessages(welcomeMessages);
            setHasInitialized(true);
        };

        fetchProfileAndSetIntro();
    }, [isFullScreen, user, loading, hasInitialized]);

    // Rotate placeholder text every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [placeholders.length]);

    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const renderMessage = (content: string) => {
        // Regex to match markdown links: [text](url)
        // AND raw URLs that aren't part of a markdown link
        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const urlRegex = /(https?:\/\/[^\s]+)/g;

        const parts = [];
        let lastIndex = 0;
        let match;

        // First pass: Markdown links
        // simpler approach: split by markdown links first
        // We need a more robust parser for mixed content, but let's do a simple split for now.

        // Let's use a split approach.
        const elements: React.ReactNode[] = [];

        // Split by markdown link pattern
        const mdParts = content.split(/(\[[^\]]+\]\([^)]+\))/g);

        mdParts.forEach((part, i) => {
            const mdMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (mdMatch) {
                // It's a markdown link
                elements.push(
                    <a
                        key={i}
                        href={mdMatch[2]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 transition-colors"
                    >
                        {mdMatch[1]}
                    </a>
                );
            } else {
                // It's text, but check for raw URLs in it too
                const urlParts = part.split(/(https?:\/\/[^\s]+)/g);
                urlParts.forEach((subPart, j) => {
                    if (subPart.match(/^https?:\/\//)) {
                        elements.push(
                            <a
                                key={`${i}-${j}`}
                                href={subPart}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 transition-colors break-all"
                            >
                                {subPart}
                            </a>
                        );
                    } else {
                        elements.push(subPart);
                    }
                });
            }
        });

        return elements;
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        const newUserMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, newUserMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Prepare history for API
            const history = messages.map(m => ({
                role: m.role,
                content: m.content
            }));

            // Get auth session for personalization
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: text,
                    category: activeCategory,
                    history: history
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || response.statusText);
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botResponseText = '';

            const botMessageId = (Date.now() + 1).toString();

            // Add empty bot message to start streaming into
            setMessages(prev => [...prev, {
                id: botMessageId,
                role: 'model',
                content: '',
                timestamp: Date.now()
            }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                botResponseText += chunk;

                setMessages(prev => prev.map(msg =>
                    msg.id === botMessageId ? { ...msg, content: botResponseText } : msg
                ));
            }

        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 2).toString(),
                role: 'model',
                content: "I'm having trouble connecting right now. Please try again later.",
                timestamp: Date.now()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCategoryClick = (category: string) => {
        setActiveCategory(category); // Set context for future messages

        // 1. Add User Message
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: `What can I ask about ${category}?`,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);

        // 2. Simulate Bot Response with Questions
        const questions = CATEGORY_QUESTIONS[category] || ["Tell me more about what you're looking for regarding " + category];

        const botContent = "Here are some things you could ask me about " + category + ":\n\n" +
            questions.map(q => "• " + q).join("\n");

        setTimeout(() => {
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: botContent,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, botMsg]);
        }, 600); // Small natural delay
    };

    return (
        <div className={`flex flex-col h-full bg-black/40 backdrop-blur-3xl border border-white/10 rounded-none md:rounded-[40px] overflow-hidden shadow-2xl transition-all duration-500`}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-transparent flex items-center justify-center shadow-inner border border-white/20 overflow-hidden">
                        <img
                            src="/nsso-agent-avatar.png"
                            alt="Agent Avatar"
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-white font-semibold text-lg tracking-tight font-['SF_Pro_Rounded']">nsso agent</h3>
                            <span className="text-white/40 text-[9px] font-medium tracking-wider uppercase">Beta</span>
                        </div>
                        <a
                            href="https://drive.google.com/file/d/1fRA7_xIrCw0XtOORljA3crcdSOCdFx3M/view?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-300 font-medium tracking-wider uppercase hover:text-cyan-200 hover:underline transition-colors cursor-pointer"
                        >
                            PURPOSE PARTNER
                        </a>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isFullScreen && onMaximize && (
                        <button onClick={onMaximize} className="hidden md:block p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                            <Maximize2 size={18} />
                        </button>
                    )}
                    {isFullScreen && onMinimize && (
                        <button onClick={onMinimize} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                            <Minimize2 size={18} />
                        </button>
                    )}
                    {onClose && (
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-4 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap ${msg.role === 'user'
                            ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-none'
                            : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                            }`}>
                            {renderMessage(msg.content)}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/10 rounded-2xl rounded-tl-none p-4 flex gap-1.5 shadow-sm border border-white/5">
                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Persistent Content Area (Categories + Input) */}
            <div className="bg-black/20 backdrop-blur-md border-t border-white/10">

                {/* Categories */}
                <div className="px-6 pt-4 pb-2">
                    <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-0 mb-3">
                        <p className="text-white/40 text-xs font-medium uppercase tracking-wider">What you can ask me about</p>
                        <p
                            className="hidden md:block text-white/40 text-xs font-medium uppercase tracking-wider cursor-help hover:text-cyan-400 transition-colors relative"
                            onMouseEnter={() => setShowVennDiagram(true)}
                            onMouseLeave={() => setShowVennDiagram(false)}
                        >
                            Why not just use chat gpt?
                            {/* Venn Diagram Tooltip - Rendered outside chatbot using portal */}
                            {showVennDiagram && createPortal(
                                <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 9999 }}>
                                    <img
                                        src="/nsso-venn-diagram.jpg"
                                        alt="NSSO Agent vs ChatGPT Venn Diagram"
                                        className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border-4 border-cyan-500/50"
                                    />
                                </div>,
                                document.body
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto scrollbar-none">
                        {Object.keys(CATEGORY_QUESTIONS).map(cat => (
                            <button
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all shadow-sm mb-1 
                                    ${activeCategory === cat
                                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                        : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-cyan-500/50 hover:text-cyan-300'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                    {/* Mobile Only: Why not just use chat gpt? (Below categories) */}
                    <div className="mt-3 block md:hidden">
                        <p
                            className="text-cyan-300 text-xs font-medium uppercase tracking-wider cursor-help hover:text-cyan-200 transition-colors relative text-left"
                            onMouseEnter={() => setShowVennDiagram(true)}
                            onMouseLeave={() => setShowVennDiagram(false)}
                        >
                            Why not just use chat gpt?
                        </p>
                    </div>
                </div>

                {/* Input */}
                <div className="p-6 pt-2">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }}
                        className="relative group"
                    >
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={placeholders[placeholderIndex]}
                            className="w-full bg-black/40 border border-white/10 rounded-[20px] pl-5 pr-12 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30 focus:bg-black/60 focus:ring-1 focus:ring-cyan-500/20 transition-all shadow-inner text-base"
                        />
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || isLoading}
                            className="absolute right-2 top-2 p-2 bg-white/10 text-white rounded-full hover:bg-cyan-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
