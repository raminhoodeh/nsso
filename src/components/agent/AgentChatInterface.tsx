"use client";

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, User, Bot, Maximize2, Minimize2, X, ChevronDown, ChevronUp, Check, XCircle, RotateCcw, Zap } from 'lucide-react';
import { splitActionPayload, type DeityAction } from '@/lib/deity/actionParser';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
    actions?: (DeityAction & { status?: 'applied' | 'rejected' })[]; // Actions extracted from this message
}

interface AgentChatInterfaceProps {
    isFullScreen?: boolean;
    onMaximize?: () => void;
    onMinimize?: () => void;
    onClose?: () => void;
    initialMessage?: string;
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
import { useProfile } from '@/components/providers/ProfileProvider';
import { useToast } from '@/components/ui/Toast';

export default function AgentChatInterface({ isFullScreen, onMaximize, onMinimize, onClose, initialMessage }: AgentChatInterfaceProps) {
    const { user, loading } = useUser();
    const { profile, updateField, addLink, updateLink, removeLink, reorderLinks, addExperience, addProject, addQualification, addProduct, undo, canUndo, fastMode, setFastMode } = useProfile();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const supabase = createClient();

    const [hasInitialized, setHasInitialized] = useState(false);
    const [placeholderIndex, setPlaceholderIndex] = useState(0);
    const [showVennDiagram, setShowVennDiagram] = useState(false);
    const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(true);
    const [isTyping, setIsTyping] = useState(false); // For word-by-word animation

    const placeholders = [
        "What is your dream?",
        "Ask about films, courses, or career advice...",
        "Try: 'Recommend inspiring films'",
        "Select a category above for best results!"
    ];

    useEffect(() => {
        const fetchProfileAndSetIntro = async () => {
            if (loading || hasInitialized) return;

            let firstName = 'creator';
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
                    introText = "Hey creator, I’m here to help you feel clear about yourself, your offering and your plan of action. I’ve been loaded up with a custom database of all the latest AI tools, business strategy, courses, career advice, and services out there. A lot of these resources won’t be found from a normal search engine or AI tool, as they have been curated from unique sources by my founder. Copy / paste anything about yourself; your CV, LinkedIn etc. so I can give you more tailored advice. The more you tell me about yourself, the better my advice would be. I recommend that you make a nsso profile so I can do this more effectively. Select a category below or ask me anything to get started.";
                } else {
                    // Pop-up
                    introText = "Hey creator, I’m here to help you feel clear about yourself, your offering and your plan of action. Select a category below or ask me anything to get started.";
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
                    content: '💡 Tip: I can help you write your bio, finding the right words to describe yourself is hard... but I\'m really good at it.',
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

    // Handle initial message from props
    useEffect(() => {
        if (initialMessage && hasInitialized) {
            handleSendMessage(initialMessage);
        }
    }, [initialMessage, hasInitialized]);

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

        // Strip JSON action blocks from display
        const cleanContent = content.replace(/```json\s*\n{[\s\S]*?}\s*\n```/g, '').trim();

        // Let's use a split approach.
        const elements: React.ReactNode[] = [];

        // Split by markdown link pattern
        const mdParts = cleanContent.split(/(\[[^\]]+\]\([^)]+\))/g);

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

    // Safe year parser helper
    const parseYear = (value: string | number | undefined | null): number | undefined => {
        if (!value) return undefined;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const clean = value.replace(/[^0-9]/g, '');
            if (!clean) return undefined;
            return parseInt(clean, 10);
        }
        return undefined;
    }

    // Action execution with word-by-word animation
    const executeAction = async (action: DeityAction) => {
        console.log('⚡ executing action:', action);
        if (action.action === 'UPDATE_FIELD' && action.target && action.value) {
            console.log('📝 Update Field:', action.target, action.value);
            setIsTyping(true);

            if (fastMode) {
                // Fast mode: instant update
                await updateField(action.target as keyof typeof profile, action.value, true);
                showToast(`Deity updated your ${action.target}`, 'success');
                setIsTyping(false);
            } else {
                // Review mode: word-by-word animation
                const words = action.value.split(' ');
                let currentText = '';

                for (const word of words) {
                    currentText += (currentText ? ' ' : '') + word;
                    // Update local state only (persist=false)
                    await updateField(action.target as keyof typeof profile, currentText, false);
                    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per word
                }

                // Final save to DB (persist=true)
                await updateField(action.target as keyof typeof profile, action.value, true);

                showToast(`Deity updated your ${action.target}`, 'success');
                setIsTyping(false);
            }
        } else if (action.action === 'ADD_LINK' && action.name && action.url) {
            const success = await addLink(action.name, action.url);
            if (success) {
                showToast(`Added link: ${action.name}`, 'success');
            } else {
                showToast(`Failed to add link`, 'error');
            }
        } else if (action.action === 'UPDATE_LINK' && action.linkId) {
            let success = false;
            if (action.name) {
                success = await updateLink(action.linkId, 'link_name', action.name);
                if (success) showToast(`Renamed link to: ${action.name}`, 'success');
            } else if (action.url) {
                success = await updateLink(action.linkId, 'link_url', action.url);
                if (success) showToast(`Updated link URL`, 'success');
            }
            if (!success) showToast(`Failed to update link`, 'error');
        } else if (action.action === 'REMOVE_LINK' && action.id) {
            const success = await removeLink(action.id);
            if (success) {
                showToast(`Removed link`, 'success');
            } else {
                showToast(`Failed to remove link`, 'error');
            }
        } else if (action.action === 'REORDER_LINKS' && action.order) {
            const success = await reorderLinks(action.order);
            if (success) {
                showToast(`Reordered links`, 'success');
            } else {
                showToast(`Failed to reorder links`, 'error');
            }
        } else if (action.action === 'ADD_EXPERIENCE') {
            const company = action.company || (action as any).company_name;
            const title = action.title || (action as any).job_title;

            if (company && title) {
                const startYear = parseYear(action.startYear || (action as any).start_year) || new Date().getFullYear();
                const endYear = parseYear(action.endYear || (action as any).end_year) || null; // Force null if undefined/NaN

                console.log(`⚡ Adding experience: ${title} at ${company} (${startYear} - ${endYear})`);

                const success = await addExperience(
                    company,
                    title,
                    startYear,
                    endYear,
                    action.description
                );
                if (success) {
                    showToast(`Added experience: ${title} at ${company}. Check your dashboard → Advanced Mode → Job titles`, 'success');
                } else {
                    showToast(`Failed to add experience (Check logs)`, 'error');
                }
            } else {
                console.warn('⚠️ ADD_EXPERIENCE missing required fields:', action);
                showToast(`Failed to add experience: Missing info`, 'error');
            }

        } else if (action.action === 'ADD_PROJECT' && action.project_name) { // Relaxed check: description not strictly required here if provider handles it
            const success = await addProject(
                action.project_name,
                action.project_description, // Can be undefined
                action.project_url
            );
            if (success) {
                showToast(`Added project: ${action.project_name}. Check your dashboard → Advanced Mode → Projects`, 'success');
            } else {
                showToast(`Failed to add project`, 'error');
            }
        } else if (action.action === 'ADD_QUALIFICATION' && action.institution && action.degree) {
            const year = parseYear(action.year) || new Date().getFullYear();

            const success = await addQualification(
                action.institution,
                action.degree,
                year
            );
            if (success) {
                showToast(`Added qualification: ${action.degree}. Check your dashboard → Advanced Mode → Qualifications`, 'success');
            } else {
                showToast(`Failed to add qualification`, 'error');
            }
        } else if (action.action === 'ADD_PRODUCT' && action.product_name) { // Relaxed check
            const success = await addProduct(
                action.product_name,
                action.product_description,
                action.price,
                action.purchase_url
            );
            if (success) {
                showToast(`Added product: ${action.product_name}. Check your dashboard → Advanced Mode → Products`, 'success');
            } else {
                showToast(`Failed to add product`, 'error');
            }
        }
    };


    // Handle Apply button click
    const handleApplyAction = async (messageId: string, actionIndex: number, action: DeityAction) => {
        await executeAction(action);

        setMessages(prev => prev.map(msg => {
            if (msg.id === messageId && msg.actions) {
                const newActions = [...msg.actions];
                newActions[actionIndex] = { ...newActions[actionIndex], status: 'applied' };
                return { ...msg, actions: newActions };
            }
            return msg;
        }));
    };

    // Handle Reject button click
    const handleRejectAction = (messageId: string, actionIndex: number) => {
        // Mark action as rejected instead of removing
        setMessages(prev => prev.map(msg => {
            if (msg.id === messageId && msg.actions) {
                const newActions = [...msg.actions];
                newActions[actionIndex] = { ...newActions[actionIndex], status: 'rejected' };
                return { ...msg, actions: newActions };
            }
            return msg;
        }));
        showToast('Suggestion rejected', 'info');
    };

    // Handle Undo button click
    const handleUndo = () => {
        undo();
        showToast('Last change undone', 'success');
    };

    // Toggle fast mode
    const toggleFastMode = async () => {
        await setFastMode(!fastMode);
        showToast(`Fast mode ${!fastMode ? 'enabled' : 'disabled'}`, 'success');
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        // Autos-collapse categories to give more space
        setIsCategoriesExpanded(false);

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

            const response = await fetch('/api/deity/chat', {
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

            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                accumulatedText += chunk;

                // Check for action delimiter
                const { message: messageText, actionsJson } = splitActionPayload(accumulatedText);

                // Update message content (without action payload)
                setMessages(prev => prev.map(msg =>
                    msg.id === botMessageId ? { ...msg, content: messageText } : msg
                ));

                // If actions detected, parse and attach to message
                if (actionsJson) {
                    try {
                        const actionsParsed: DeityAction[] = JSON.parse(actionsJson);
                        console.log('✨ Deity actions parsed:', actionsParsed);

                        // If fast mode, mark as applied immediately to prevent UI glitch
                        const actionsWithStatus = fastMode
                            ? actionsParsed.map(a => ({ ...a, status: 'applied' as const }))
                            : actionsParsed;

                        setMessages(prev => prev.map(msg =>
                            msg.id === botMessageId ? { ...msg, actions: actionsWithStatus } : msg
                        ));

                        // Auto-execute if fast mode enabled
                        if (fastMode && actionsParsed.length > 0) {
                            for (const action of actionsParsed) {
                                await executeAction(action);
                            }
                        }
                    } catch (e) {
                        console.error('Failed to parse actions:', e);
                    }
                    break; // Stop reading after actions extracted
                }
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
        setIsCategoriesExpanded(false);

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
        <div className={`flex flex-col h-dvh bg-black/40 backdrop-blur-3xl transition-all duration-500 
            ${isFullScreen
                ? 'w-full rounded-none border-none shadow-none'
                : 'border border-white/10 rounded-none md:rounded-l-[32px] md:rounded-r-none overflow-hidden shadow-2xl'
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/20 overflow-hidden backdrop-blur-sm">
                        <img
                            src="/deity logo white.png"
                            alt="Deity Avatar"
                            className="w-3/5 h-3/5 object-contain opacity-90"
                        />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-white font-semibold text-lg tracking-tight font-['SF_Pro_Rounded']">Deity</h3>
                        </div>
                        <span className="text-xs text-white/40 font-medium tracking-wide">
                            PURPOSE PARTNER
                        </span>
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

                    {/* Undo Button */}
                    {canUndo && (
                        <button
                            onClick={handleUndo}
                            className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                            title="Undo last change"
                        >
                            <RotateCcw size={18} />
                        </button>
                    )}

                    {/* Fast Mode Toggle */}
                    <button
                        onClick={toggleFastMode}
                        className={`p-2 hover:bg-white/10 rounded-full transition-colors ${fastMode ? 'text-cyan-400' : 'text-white/60 hover:text-white'
                            }`}
                        title={`Fast Mode: ${fastMode ? 'ON' : 'OFF'}`}
                    >
                        <Zap size={18} className={fastMode ? 'fill-cyan-400' : ''} />
                    </button>

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
                    <div key={msg.id} className="flex flex-col gap-2">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-4 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap ${msg.role === 'user'
                                ? 'bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-none'
                                : 'bg-white/10 text-white/90 rounded-tl-none border border-white/5'
                                }`}>
                                {renderMessage(msg.content)}
                            </div>
                        </div>

                        {/* Action Buttons (only for model messages with actions) */}
                        {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] flex flex-wrap gap-2">
                                    {msg.actions.map((action, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all duration-300
                                                ${action.status === 'applied' ? 'bg-green-500/10 border-green-500/30' :
                                                    action.status === 'rejected' ? 'bg-red-500/5 border-red-500/20 opacity-60' :
                                                        'border-white/20 bg-white/5'}`}
                                            style={{
                                                backdropFilter: 'blur(20px)'
                                            }}
                                        >
                                            <span className={`text-xs ${action.status === 'applied' ? 'text-green-200' : action.status === 'rejected' ? 'text-red-200/70' : 'text-white/60'}`}>
                                                {action.action === 'UPDATE_FIELD' && `Update ${action.target}`}
                                                {action.action === 'ADD_LINK' && `Add link: ${action.name}`}
                                                {action.action === 'UPDATE_LINK' && `Rename to: ${action.name || 'update URL'}`}
                                                {action.action === 'REMOVE_LINK' && `Remove link`}
                                                {action.action === 'REORDER_LINKS' && `Reorder ${action.order?.length} links`}
                                                {action.action === 'ADD_EXPERIENCE' && `Add experience: ${action.company}`}
                                                {action.action === 'ADD_PROJECT' && `Add project: ${action.project_name}`}
                                                {action.action === 'ADD_QUALIFICATION' && `Add qualification: ${action.degree}`}
                                                {action.action === 'ADD_PRODUCT' && `Add product: ${action.product_name}`}
                                            </span>

                                            {action.status === 'applied' ? (
                                                <div className="flex items-center gap-1 px-2 py-1 text-green-400 text-xs font-medium">
                                                    <Check size={14} />
                                                    <span>Accepted</span>
                                                </div>
                                            ) : action.status === 'rejected' ? (
                                                <div className="flex items-center gap-1 px-2 py-1 text-red-400/70 text-xs font-medium">
                                                    <XCircle size={14} />
                                                    <span>Rejected</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleApplyAction(msg.id, idx, action)}
                                                        disabled={isTyping}
                                                        className="flex items-center gap-1 px-3 py-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-medium transition-colors disabled:opacity-50"
                                                    >
                                                        <Check size={14} />
                                                        Apply
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectAction(msg.id, idx)}
                                                        className="flex items-center gap-1 px-3 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors"
                                                    >
                                                        <XCircle size={14} />
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
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
                <div className="px-6 pt-4 pb-2 transition-all duration-300">
                    <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-0 mb-3">
                        <button
                            onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
                            className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider hover:text-white/70 transition-colors group"
                        >
                            What you can ask me about
                            {isCategoriesExpanded ? (
                                <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                            ) : (
                                <ChevronUp size={14} className="group-hover:-translate-y-0.5 transition-transform" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Collapsible Area */}
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isCategoriesExpanded ? 'max-h-[120px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="flex flex-wrap gap-2 overflow-y-auto scrollbar-none pb-2">
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
                        {/* NSSO Database Trigger */}
                        <button
                            className="px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs font-bold tracking-wide transition-all shadow-sm mb-1 hover:bg-cyan-500/20 hover:border-cyan-500"
                            onMouseEnter={() => setShowVennDiagram(true)}
                            onMouseLeave={() => setShowVennDiagram(false)}
                        >
                            NSSO DATABASE
                        </button>
                    </div>
                </div>

                {/* Venn Diagram Tooltip Portal */}
                {showVennDiagram && createPortal(
                    <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 9999 }}>
                        <img
                            src="/nsso-venn-diagram.jpg"
                            alt="NSSO Agent vs ChatGPT Venn Diagram"
                            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border-4 border-cyan-500/50 block"
                        />
                    </div>,
                    document.body
                )}

                {/* Mobile Only: Why not just use chat gpt? (Below categories) */}

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
                        className="w-full bg-black/40 border border-white/10 rounded-full pl-5 pr-12 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30 focus:bg-black/60 focus:ring-1 focus:ring-cyan-500/20 transition-all shadow-inner text-base"
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 text-white rounded-full hover:bg-cyan-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
}
