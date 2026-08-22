"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, Maximize2, Minimize2, X, ChevronDown, ChevronUp, Check, XCircle, RotateCcw, Zap } from 'lucide-react';
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
import {
    TahoeGlassButton,
    TahoeGlassField,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass';

export default function AgentChatInterface({ isFullScreen, onMaximize, onMinimize, onClose, initialMessage }: AgentChatInterfaceProps) {
    const { user, loading } = useUser();
    const { updateField, addLink, updateLink, removeLink, reorderLinks, addExperience, addProject, addQualification, addProduct, undo, canUndo, fastMode, setFastMode } = useProfile();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const supabase = useMemo(() => createClient(), []);

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
            let introText = '';

            if (user) {
                try {
                    // Fetch profile to get full_name and bio
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, bio')
                        .eq('user_id', user.id)
                        .single();

                    if (profile?.full_name) {
                        firstName = profile.full_name.split(' ')[0];
                    } else if (user.username) {
                        firstName = user.username;
                    }

                    const hasBio = !!profile?.bio;
                    // skipping experience check for now to avoid query complexity
                    const hasExperience = true;

                    if (isFullScreen) {
                        if (!hasBio || !hasExperience) {
                            introText = `Love your profile ${firstName || 'there'}… now let’s build it out!

I can help you in two powerful ways:
1. **Profile Creation**: Tell me to "Add my experience at Google" or "Update my bio" to build your presence.
2. **Gathering Insights**: Ask me questions like "How do I find investors?" or "Recommend design books" to tap into my exclusive database.

Let's get started—what would you like to do first?`;
                        } else {
                            introText = `Love your profile ${firstName || 'there'}… now let’s get your name out there!

I can help you in two powerful ways:
1. **Profile Creation**: Tell me to "Add my experience at Google" or "Update my bio" to build your presence.
2. **Gathering Insights**: Ask me questions like "How do I find investors?" or "Recommend design books" to tap into my exclusive database.

Check out some of the areas I can help you with below.`;
                        }
                    } else {
                        // Pop-up
                        introText = `Love your profile ${firstName}… now let’s get your name out there! Check out some of the areas I can help you with below.`;
                    }
                } catch (err) {
                    console.error('Error fetching profile:', err);
                    if (user.username) firstName = user.username;
                    // Fallback for introText if profile fetch fails
                    if (isFullScreen) {
                        introText = `Love your profile ${firstName || 'there'}… now let’s get your name out there!

I can help you in two powerful ways:
1. **Profile Creation**: Tell me to "Add my experience at Google" or "Update my bio" to build your presence.
2. **Gathering Insights**: Ask me questions like "How do I find investors?" or "Recommend design books" to tap into my exclusive database.

Check out some of the areas I can help you with below.`;
                    } else {
                        introText = `Love your profile ${firstName}… now let’s get your name out there! Check out some of the areas I can help you with below.`;
                    }
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
    }, [isFullScreen, user, loading, hasInitialized, supabase]);

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
        // The send callback is intentionally excluded so one initial message
        // cannot be replayed as chat state changes during streaming.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMessage, hasInitialized]);

    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const renderMessage = (content: string) => {
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
                        key={`link-${i}`}
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
                                key={`url-${i}-${j}`}
                                href={subPart}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 transition-colors break-all"
                            >
                                {subPart}
                            </a>
                        );
                    } else {
                        // Check for bold text: **text**
                        const boldParts = subPart.split(/(\*\*[^*]+\*\*)/g);
                        boldParts.forEach((boldPart, k) => {
                            const boldMatch = boldPart.match(/^\*\*([^*]+)\*\*$/);
                            if (boldMatch) {
                                elements.push(
                                    <strong key={`bold-${i}-${j}-${k}`} className="font-bold text-white">
                                        {boldMatch[1]}
                                    </strong>
                                );
                            } else if (boldPart) {
                                elements.push(<span key={`text-${i}-${j}-${k}`}>{boldPart}</span>);
                            }
                        });
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
    const executeAction = async (action: DeityAction): Promise<boolean> => {
        console.log('⚡ executing action:', action);
        if (action.action === 'UPDATE_FIELD' && action.target && action.value) {
            const targetField = action.target.toLowerCase() as keyof ReturnType<typeof useProfile>['profile'];
            console.log('📝 Update Field:', targetField, action.value);
            setIsTyping(true);

            if (fastMode) {
                // Fast mode: instant update
                const success = await updateField(targetField, action.value, true);
                if (success) {
                    showToast(`Deity updated your ${action.target}`, 'success');
                } else {
                    showToast(`Failed to update ${action.target}`, 'error');
                }
                setIsTyping(false);
                return success;
            } else {
                // Review mode: word-by-word animation
                const words = action.value.split(' ');
                let currentText = '';

                for (const word of words) {
                    currentText += (currentText ? ' ' : '') + word;
                    // Update local state only (persist=false)
                    await updateField(targetField, currentText, false);
                    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per word
                }

                // Final save to DB (persist=true)
                const success = await updateField(targetField, action.value, true);

                if (success) {
                    showToast(`Deity updated your ${action.target}`, 'success');
                } else {
                    showToast(`Failed to update ${action.target}`, 'error');
                }
                setIsTyping(false);
                return success;
            }
        } else if (action.action === 'ADD_LINK' && action.name && action.url) {
            const success = await addLink(action.name, action.url);
            if (success) {
                showToast(`Added link: ${action.name}`, 'success');
            } else {
                showToast(`Failed to add link`, 'error');
            }
            return success;
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
            return success;
        } else if (action.action === 'REMOVE_LINK' && action.id) {
            const success = await removeLink(action.id);
            if (success) {
                showToast(`Removed link`, 'success');
            } else {
                showToast(`Failed to remove link`, 'error');
            }
            return success;
        } else if (action.action === 'REORDER_LINKS' && action.order) {
            const success = await reorderLinks(action.order);
            if (success) {
                showToast(`Reordered links`, 'success');
            } else {
                showToast(`Failed to reorder links`, 'error');
            }
            return success;
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
                return success;
            } else {
                console.warn('⚠️ ADD_EXPERIENCE missing required fields:', action);
                showToast(`Failed to add experience: Missing info`, 'error');
                return false;
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
            return success;
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
            return success;
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
            return success;
        }
        return false;
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

        // Trigger follow-up suggestion
        triggerFollowUp(action);
    };

    const triggerFollowUp = async (action?: DeityAction) => {
        const actionDesc = action
            ? (action.action === 'UPDATE_FIELD' && action.target ? action.target : 'profile')
            : 'profile';

        const botMessageId = (Date.now() + 100).toString();
        setMessages(prev => [...prev, {
            id: botMessageId,
            role: 'model',
            content: '',
            timestamp: Date.now()
        }]);

        try {
            const history = messages.map(m => ({ role: m.role, content: m.content }));
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

            const response = await fetch('/api/deity/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: `[SYSTEM: The user successfully updated their ${actionDesc}. 1. Acknowledge this confirming it's done. 2. Suggest ONE other specific profile section to improve next (e.g. Bio, Experience, Projects). Do NOT suggest updating ${actionDesc} again. Use text ONLY. Do NOT use any tools.]`,
                    history,
                    disableTools: true
                }),
            });

            if (!response.body) throw new Error("No response body");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulatedText += decoder.decode(value);

                const { message: messageText, actionsJson } = splitActionPayload(accumulatedText);

                setMessages(prev => prev.map(msg =>
                    msg.id === botMessageId ? { ...msg, content: messageText } : msg
                ));

                if (actionsJson) {
                    try {
                        const actionsParsed: DeityAction[] = JSON.parse(actionsJson);
                        setMessages(prev => prev.map(msg =>
                            msg.id === botMessageId ? { ...msg, actions: actionsParsed } : msg
                        ));
                    } catch (e) {
                        console.error('Failed to parse actions in follow-up', e);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('Error in follow-up:', error);
        }
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
                            for (let i = 0; i < actionsParsed.length; i++) {
                                const action = actionsParsed[i];
                                const success = await executeAction(action);

                                if (!success) {
                                    // Rollback status to rejected/failed in UI
                                    setMessages(prev => prev.map(msg =>
                                        msg.id === botMessageId && msg.actions ? {
                                            ...msg,
                                            actions: msg.actions.map((a, idx) =>
                                                idx === i ? { ...a, status: 'rejected' as const } : a
                                            )
                                        } : msg
                                    ));
                                }
                            }
                            // Trigger follow-up after auto-execution (regardless of success/fail to keep flow moving? 
                            // Or mainly if success. Let's trigger anyway as it might have partial success)
                            triggerFollowUp();
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
        <TahoeGlassSurface
            as="section"
            variant="panel"
            radius={isFullScreen ? 0 : '32px 0 0 32px'}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.04}
            aria-label="Deity assistant"
            className={`h-dvh transition-all duration-500 ${isFullScreen
                ? 'w-full border-none'
                : 'w-full overflow-hidden border border-white/10'
                }`}
            contentClassName="flex h-full min-h-0 flex-col"
        >
            <header className="flex items-center justify-between border-b border-white/10 p-6">
                <div className="flex items-center gap-4">
                    <TahoeGlassSurface
                        variant="mediaFrame"
                        radius={9999}
                        tone="light"
                        className="h-10 w-10 overflow-hidden border border-white/20"
                        contentClassName="h-full w-full"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/nsso-agent-avatar.png"
                            alt="Deity Avatar"
                            className="h-full w-full object-cover opacity-90"
                        />
                    </TahoeGlassSurface>
                    <a
                        href="https://drive.google.com/file/d/1fRA7_xIrCw0XtOORljA3crcdSOCdFx3M/view?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="transition-opacity hover:opacity-80"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/deity logo white.png"
                            alt="Deity"
                            className="h-8 w-auto translate-y-1 object-contain"
                        />
                    </a>
                </div>
                <div className="flex items-center gap-2">
                    {!isFullScreen && onMaximize && (
                        <TahoeGlassButton
                            onClick={onMaximize}
                            aria-label="Expand Deity chat"
                            title="Expand chat"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.035}
                            className="hidden p-2 md:inline-flex"
                            contentClassName="text-white/60 hover:text-white"
                        >
                            <Maximize2 size={18} />
                        </TahoeGlassButton>
                    )}
                    {isFullScreen && onMinimize && (
                        <TahoeGlassButton
                            onClick={onMinimize}
                            aria-label="Minimize Deity chat"
                            title="Minimize chat"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.035}
                            className="p-2"
                            contentClassName="text-white/60 hover:text-white"
                        >
                            <Minimize2 size={18} />
                        </TahoeGlassButton>
                    )}

                    {canUndo && (
                        <TahoeGlassButton
                            onClick={handleUndo}
                            aria-label="Undo last profile change"
                            title="Undo last change"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.035}
                            className="p-2"
                            contentClassName="text-white/60 hover:text-white"
                        >
                            <RotateCcw size={18} />
                        </TahoeGlassButton>
                    )}

                    <TahoeGlassButton
                        onClick={toggleFastMode}
                        aria-label={`Fast mode ${fastMode ? 'on' : 'off'}`}
                        aria-pressed={fastMode}
                        title={`Fast Mode: ${fastMode ? 'ON' : 'OFF'}`}
                        tone="light"
                        semanticTint={fastMode ? 'light' : 'dark'}
                        semanticTintOpacity={fastMode ? 0.07 : 0.035}
                        className="p-2"
                        contentClassName={fastMode ? 'text-cyan-300' : 'text-white/60 hover:text-white'}
                    >
                        <Zap size={18} className={fastMode ? 'fill-cyan-400' : ''} />
                    </TahoeGlassButton>

                    {onClose && (
                        <TahoeGlassButton
                            onClick={onClose}
                            aria-label="Close Deity chat"
                            title="Close chat"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.035}
                            className="p-2"
                            contentClassName="text-white/60 hover:text-white"
                        >
                            <X size={18} />
                        </TahoeGlassButton>
                    )}
                </div>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col gap-2">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.content.trim() && (
                                <TahoeGlassSurface
                                    as="article"
                                    variant="popover"
                                    radius={msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}
                                    tone="light"
                                    semanticTint={msg.role === 'user' ? 'light' : 'dark'}
                                    semanticTintOpacity={msg.role === 'user' ? 0.07 : 0.045}
                                    aria-label={`${msg.role === 'user' ? 'Your' : 'Deity'} message`}
                                    className={`max-w-[85%] border p-4 text-[15px] leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'border-cyan-300/25 text-white'
                                        : 'border-white/10 text-white/90'
                                        }`}
                                >
                                    {renderMessage(msg.content)}
                                </TahoeGlassSurface>
                            )}
                        </div>

                        {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                            <div className="flex justify-start">
                                <div className="flex max-w-[85%] flex-wrap gap-2">
                                    {msg.actions.map((action, idx) => (
                                        <TahoeGlassSurface
                                            key={idx}
                                            variant="recessed"
                                            tone="light"
                                            semanticTint="dark"
                                            semanticTintOpacity={0.045}
                                            className={`border px-3 py-2 text-sm transition-all duration-300 ${action.status === 'applied'
                                                ? 'border-green-500/30'
                                                : action.status === 'rejected'
                                                    ? 'border-red-500/20 opacity-60'
                                                    : 'border-white/20'
                                                }`}
                                            contentClassName="flex items-center gap-2"
                                        >
                                            <span className={`text-xs ${action.status === 'applied' ? 'text-green-200' : action.status === 'rejected' ? 'text-red-200/70' : 'text-white/60'}`}>
                                                {action.action === 'UPDATE_FIELD' && `Update ${action.target}`}
                                                {action.action === 'ADD_LINK' && `Add link: ${action.name}`}
                                                {action.action === 'UPDATE_LINK' && `Rename to: ${action.name || 'update URL'}`}
                                                {action.action === 'REMOVE_LINK' && 'Remove link'}
                                                {action.action === 'REORDER_LINKS' && `Reorder ${action.order?.length} links`}
                                                {action.action === 'ADD_EXPERIENCE' && `Add experience: ${action.company}`}
                                                {action.action === 'ADD_PROJECT' && `Add project: ${action.project_name}`}
                                                {action.action === 'ADD_QUALIFICATION' && `Add qualification: ${action.degree}`}
                                                {action.action === 'ADD_PRODUCT' && `Add product: ${action.product_name}`}
                                            </span>

                                            {action.status === 'applied' ? (
                                                <div role="status" className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-400">
                                                    <Check size={14} />
                                                    <span>Done, profile updated!</span>
                                                </div>
                                            ) : action.status === 'rejected' ? (
                                                <div role="status" className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-400/70">
                                                    <XCircle size={14} />
                                                    <span>Rejected</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <TahoeGlassButton
                                                        onClick={() => handleApplyAction(msg.id, idx, action)}
                                                        disabled={isTyping}
                                                        aria-label="Apply suggested profile change"
                                                        tone="light"
                                                        semanticTint="light"
                                                        semanticTintOpacity={0.055}
                                                        className="border border-cyan-400/25 px-3 py-1"
                                                        contentClassName="text-xs font-medium text-cyan-300"
                                                    >
                                                        <Check size={14} />
                                                        Apply
                                                    </TahoeGlassButton>
                                                    <TahoeGlassButton
                                                        onClick={() => handleRejectAction(msg.id, idx)}
                                                        aria-label="Reject suggested profile change"
                                                        tone="light"
                                                        semanticTint="dark"
                                                        semanticTintOpacity={0.055}
                                                        className="border border-red-400/25 px-3 py-1"
                                                        contentClassName="text-xs font-medium text-red-300"
                                                    >
                                                        <XCircle size={14} />
                                                        Reject
                                                    </TahoeGlassButton>
                                                </>
                                            )}
                                        </TahoeGlassSurface>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <TahoeGlassSurface
                            variant="popover"
                            radius="16px 16px 16px 4px"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.045}
                            role="status"
                            aria-label="Deity is responding"
                            className="border border-white/10 p-4"
                            contentClassName="flex gap-1.5"
                        >
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" style={{ animationDelay: '300ms' }} />
                        </TahoeGlassSurface>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <TahoeGlassSurface
                variant="menu"
                radius={0}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.035}
                className="w-full border-t border-white/10"
                contentClassName="w-full"
            >
                <div className="px-6 pb-2 pt-4 transition-all duration-300">
                    <div className="mb-3 flex flex-col items-center gap-2">
                        <TahoeGlassButton
                            onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
                            aria-expanded={isCategoriesExpanded}
                            aria-controls="deity-category-options"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.03}
                            className="px-4 py-2"
                            contentClassName="text-xs font-medium uppercase tracking-wider text-white/55"
                        >
                            What you can ask me about
                            {isCategoriesExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </TahoeGlassButton>
                    </div>
                </div>

                <div
                    id="deity-category-options"
                    aria-hidden={!isCategoriesExpanded}
                    inert={!isCategoriesExpanded}
                    className={`overflow-hidden transition-all duration-500 ease-in-out ${isCategoriesExpanded ? 'max-h-[120px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                    <div className="flex flex-wrap justify-center gap-2 overflow-y-auto px-4 pb-2 scrollbar-none">
                        {Object.keys(CATEGORY_QUESTIONS).map(cat => (
                            <TahoeGlassSurface
                                as="button"
                                variant="pill"
                                tone="light"
                                semanticTint={activeCategory === cat ? 'light' : 'dark'}
                                semanticTintOpacity={activeCategory === cat ? 0.065 : 0.03}
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                aria-pressed={activeCategory === cat}
                                className={`mb-1 border px-3 py-1.5 text-xs font-medium transition-all ${activeCategory === cat
                                    ? 'border-cyan-500 text-cyan-300'
                                    : 'border-white/10 text-white/70 hover:border-cyan-500/50 hover:text-cyan-300'
                                    }`}
                            >
                                {cat}
                            </TahoeGlassSurface>
                        ))}
                        <TahoeGlassSurface
                            as="button"
                            variant="pill"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.035}
                            className="mb-1 border border-cyan-500/30 px-3 py-1.5 text-xs font-bold tracking-wide text-cyan-300 transition-all hover:border-cyan-500"
                            onMouseEnter={() => setShowVennDiagram(true)}
                            onMouseLeave={() => setShowVennDiagram(false)}
                            onFocus={() => setShowVennDiagram(true)}
                            onBlur={() => setShowVennDiagram(false)}
                            aria-describedby={showVennDiagram ? 'deity-database-tooltip' : undefined}
                        >
                            NSSO DATABASE
                        </TahoeGlassSurface>
                    </div>
                </div>
            </TahoeGlassSurface>

            {showVennDiagram && createPortal(
                <TahoeGlassSurface
                    id="deity-database-tooltip"
                    variant="mediaFrame"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.035}
                    role="tooltip"
                    className="pointer-events-none fixed left-1/2 top-1/2 z-[9999] max-h-[90vh] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 border border-cyan-500/50 p-2"
                    contentClassName="overflow-hidden rounded-[inherit]"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/nsso-venn-diagram.jpg"
                        alt="NSSO Agent vs ChatGPT Venn Diagram"
                        className="block max-h-[calc(90vh-1rem)] max-w-[calc(90vw-1rem)] rounded-[inherit] object-contain"
                    />
                </TahoeGlassSurface>,
                document.body
            )}

            <div className="p-6 pt-2">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }}
                    className="group relative"
                >
                    <TahoeGlassField
                        label="Message Deity"
                        visuallyHideLabel
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.05}
                        surfaceClassName="border border-white/10 px-0 py-0"
                        controlClassName="px-5 py-4 pr-14 text-base text-white placeholder:text-white/30"
                    >
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={placeholders[placeholderIndex]}
                            autoComplete="off"
                        />
                    </TahoeGlassField>
                    <TahoeGlassButton
                        type="submit"
                        disabled={!inputValue.trim() || isLoading}
                        aria-label="Send message"
                        tone="light"
                        semanticTint="light"
                        semanticTintOpacity={0.06}
                        className="absolute right-2 top-1/2 z-30 -translate-y-1/2 p-2"
                        contentClassName="text-white"
                    >
                        <Send size={18} />
                    </TahoeGlassButton>
                </form>
            </div>
        </TahoeGlassSurface>
    );
}
