"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Maximize2, Minimize2, X, ChevronDown, ChevronUp, Check, XCircle, RotateCcw } from 'lucide-react';
import { splitActionPayload, parseActionList, type DeityAction } from '@/lib/deity/actionParser';
import { mutationMessage, type MutationResult } from '@/lib/profile-mutations';
import { safeWebUrl } from '@/lib/urls';
import { ALLOWANCE_CTA_URL, ALLOWANCE_CTA_LABEL, isDailyAllowanceCode, boundedChatHistory } from '@/lib/deity/chat-allowance';
import { normalizeNssoBrand } from '@/lib/deity/brand';
import { LIGHT_PANEL } from '@/components/ui/light-panel';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    timestamp: number;
    allowanceCta?: boolean;
    responseError?: boolean;
    actions?: Proposal[];
}

type ProposalStatus = 'proposed' | 'applying' | 'applied' | 'failed' | 'conflict' | 'outcomeUnknown' | 'rejected' | 'undone';
interface Proposal extends DeityAction { operationId: string; expectedRevision: number; status: ProposalStatus; error?: string }

interface AgentChatInterfaceProps {
    isFullScreen?: boolean;
    onMaximize?: () => void;
    onMinimize?: () => void;
    onClose?: () => void;
    initialMessage?: string;
    shortcutRequests?: { id: string; message: string; ownerId?: string }[];
}

interface RequestScope {
    identity: string | null;
    epoch: number;
    shortcutEpochs: Map<string, number>;
    initialMessage?: string;
    initialEpoch: number | null;
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

export default function AgentChatInterface(props: AgentChatInterfaceProps) {
    const { user, loading } = useUser();
    const ownerId = user?.id ?? 'signed-out';
    const identity = loading && !user ? null : ownerId;
    const [scope, setScope] = useState<RequestScope>(() => ({
        identity, epoch: 0,
        shortcutEpochs: new Map(identity === null ? [] : (props.shortcutRequests ?? []).map(request => [request.id, 0])),
        initialMessage: props.initialMessage,
        initialEpoch: identity === null ? null : 0,
    }));

    // Track prop events above the keyed conversation. Parents may retain their
    // entire shortcut history, so resetting only the child's consumed IDs would
    // replay old prompts under another account or after signing back in.
    let nextScope = scope;
    if (identity !== scope.identity) nextScope = { ...nextScope, identity, epoch: scope.epoch + 1 };
    if (props.initialMessage !== scope.initialMessage) {
        // Only the first bootstrap may defer an unowned prompt. Once an
        // account has existed, a new prompt during unresolved auth has no
        // reliable owner and must not borrow the next account's identity.
        const initialEpoch = identity === null ? (nextScope.epoch === 0 ? null : -1) : nextScope.epoch;
        nextScope = { ...nextScope, initialMessage: props.initialMessage, initialEpoch };
    } else if (identity !== null && props.initialMessage !== undefined && scope.initialEpoch === null) {
        nextScope = { ...nextScope, initialEpoch: nextScope.epoch };
    }
    const newRequests = props.shortcutRequests?.filter(request => !scope.shortcutEpochs.has(request.id) && (identity !== null || (nextScope.epoch > 0 && request.ownerId === undefined))) ?? [];
    if (newRequests.length) {
        const shortcutEpochs = new Map(scope.shortcutEpochs);
        for (const request of newRequests) shortcutEpochs.set(request.id, identity === null ? -1 : nextScope.epoch);
        nextScope = { ...nextScope, shortcutEpochs };
    }
    if (nextScope !== scope) {
        // React restarts this component before committing children. This avoids
        // an effect-sized window in which inherited prompts could be submitted.
        setScope(nextScope);
        return null;
    }
    if (identity === null) return (
        <section aria-label="Deity assistant" aria-busy="true" data-deity-surface="opaque" className={`${LIGHT_PANEL.surface} flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6`}>
            <p role="status" aria-live="polite">Loading Deity account…</p>
            {props.onClose && <button type="button" onClick={props.onClose} aria-label="Close Deity chat" className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm`}>Close</button>}
        </section>
    );
    // A conversation, draft and pending response belong to one identity. Never
    // carry them into another account (including a sign-out) on the same page.
    return <AccountChatInterface
        key={`${identity}:${scope.epoch}`}
        {...props}
        initialMessage={scope.initialEpoch === scope.epoch ? props.initialMessage : undefined}
        shortcutRequests={props.shortcutRequests?.filter(request => scope.shortcutEpochs.get(request.id) === scope.epoch && (request.ownerId === undefined || request.ownerId === ownerId))}
    />;
}

function AccountChatInterface({ isFullScreen, onMaximize, onMinimize, onClose, initialMessage, shortcutRequests = [] }: AgentChatInterfaceProps) {
    const { user, loading } = useUser();
    const userId = user?.id;
    const username = user?.username;
    const { applyOperation, undo, canUndo, revision, refreshProfile, getRevision, links } = useProfile();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<Message[]>([]);
    const supabase = useMemo(() => createClient(), []);

    const [hasInitialized, setHasInitialized] = useState(false);
    const [showVennDiagram, setShowVennDiagram] = useState(false);
    const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [actionPreview, setActionPreview] = useState<{operationId:string;text:string} | null>(null);
    const applying = useRef(new Set<string>());
    const activeRequest = useRef<AbortController | null>(null);
    const categoryReplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const consumedShortcuts = useRef(new Set<string>());
    const consumedInitialMessage = useRef<string | undefined>(undefined);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const databaseDialogRef = useRef<HTMLDialogElement>(null);
    const databaseTriggerRef = useRef<HTMLButtonElement>(null);
    const shellRef = useRef<HTMLElement>(null);
    const headerRef = useRef<HTMLElement>(null);
    const categoryToggleRef = useRef<HTMLDivElement>(null);
    const categoryOptionsRef = useRef<HTMLDivElement>(null);
    const composerAreaRef = useRef<HTMLDivElement>(null);
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            activeRequest.current?.abort();
            if (categoryReplyTimer.current !== null) clearTimeout(categoryReplyTimer.current);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const fetchProfileAndSetIntro = async () => {
            if (loading || hasInitialized) return;

            let firstName = 'creator';
            let introText = '';

            if (userId) {
                try {
                    // Fetch profile to get full_name and bio
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, bio')
                        .eq('user_id', userId)
                        .single();

                    if (profile?.full_name) {
                        firstName = profile.full_name.split(' ')[0];
                    } else if (username) {
                        firstName = username;
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

Let's get started. What would you like to do first?`;
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
                } catch {
                    if (cancelled) return;
                    console.error('Deity profile intro unavailable', {code:'PROFILE_INTRO_UNAVAILABLE'});
                    if (username) firstName = username;
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
            if (cancelled) return;
            // The composer is deliberately usable while this optional read is
            // pending. A late welcome must not replace user text, a category
            // reply, streamed output, or a completed proposal. The functional
            // update arbitrates against messages queued in the same render.
            setMessages(previous => previous.length === 0 ? welcomeMessages : previous);
            setHasInitialized(true);
        };

        void fetchProfileAndSetIntro();
        // Each effect instance owns its completion: StrictMode replay,
        // fullscreen changes and unmount all invalidate the old read.
        return () => { cancelled = true; };
    }, [isFullScreen, userId, username, loading, hasInitialized, supabase]);

    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const fitComposer = useCallback(() => {
        const shell = shellRef.current;
        const composer = composerRef.current;
        const header = headerRef.current;
        const toggle = categoryToggleRef.current;
        const options = categoryOptionsRef.current;
        const area = composerAreaRef.current;
        if (!shell || !composer || !header || !toggle || !options || !area) return;
        const shellHeight = shell.getBoundingClientRect().height;
        if (!shellHeight) return;
        // The standalone route has site navigation above the chat. On a short
        // viewport the actual chat pane can be much smaller than 100dvh.
        const compact = shellHeight < 400;
        const minimal = shellHeight < 240;
        shell.dataset.compact = String(compact);
        shell.dataset.minimal = String(minimal);
        const areaStyle = getComputedStyle(area);
        const composerPadding = parseFloat(areaStyle.paddingTop) + parseFloat(areaStyle.paddingBottom);
        const messagePadding = minimal ? 0 : compact ? 16 : 24;
        const available = Math.max(56, shellHeight - header.offsetHeight - toggle.offsetHeight - composerPadding - messagePadding - 1);
        const expanded = !minimal && options.getAttribute('aria-hidden') === 'false';
        const categoryHeight = expanded ? Math.min(220, Math.max(0, available - 56)) : 0;
        options.style.maxHeight = `${categoryHeight}px`;
        const limit = Math.min(160, Math.max(56, available - categoryHeight));
        composer.style.height = 'auto';
        composer.style.height = `${Math.min(composer.scrollHeight + 2, limit)}px`;
    }, []);

    useLayoutEffect(() => { fitComposer(); }, [inputValue, isCategoriesExpanded, fitComposer]);

    // Fit the visible viewport when a phone keyboard opens or browser chrome changes.
    useEffect(() => {
        const viewport = window.visualViewport;
        const fitViewport = () => {
            const shell = shellRef.current;
            if (!shell || window.innerWidth >= 768) {
                shell?.style.removeProperty('max-height');
                if (shell?.parentElement?.getAttribute('role') === 'dialog') {
                    shell.parentElement.style.removeProperty('top');
                    shell.parentElement.style.removeProperty('height');
                }
                return;
            }
            const top = isFullScreen ? Math.max(0, shell.getBoundingClientRect().top - (viewport?.offsetTop ?? 0)) : 0;
            shell.style.maxHeight = `${Math.max(140, (viewport?.height ?? window.innerHeight) - top)}px`;
            if (!isFullScreen && shell.parentElement?.getAttribute('role') === 'dialog') {
                shell.parentElement.style.top = `${viewport?.offsetTop ?? 0}px`;
                shell.parentElement.style.height = `${viewport?.height ?? window.innerHeight}px`;
            }
            fitComposer();
        };
        fitViewport();
        const resizeObserver = new ResizeObserver(fitComposer);
        for (const element of [shellRef.current, headerRef.current, categoryToggleRef.current, composerAreaRef.current]) {
            if (element) resizeObserver.observe(element);
        }
        viewport?.addEventListener('resize', fitViewport);
        viewport?.addEventListener('scroll', fitViewport);
        window.addEventListener('resize', fitViewport);
        return () => {
            viewport?.removeEventListener('resize', fitViewport);
            viewport?.removeEventListener('scroll', fitViewport);
            window.removeEventListener('resize', fitViewport);
            resizeObserver.disconnect();
        };
    }, [isFullScreen, fitComposer]);

    useEffect(() => {
        const dialog = databaseDialogRef.current;
        if (showVennDiagram && dialog && !dialog.open) dialog.showModal();
        return () => { if (dialog?.open) dialog.close(); };
    }, [showVennDiagram]);

    const closeDatabase = () => {
        // Close the native modal before its portal unmounts, so returning
        // keyboard focus does not wait for a detached dialog's close event.
        databaseDialogRef.current?.close();
        setShowVennDiagram(false);
        databaseTriggerRef.current?.focus({ preventScroll: true });
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    };

    const renderMessage = (content: string, isAssistant: boolean) => {
        const displayText = (text: string) => isAssistant ? normalizeNssoBrand(text) : text;
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
                        href={safeWebUrl(mdMatch[2]) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-800 underline underline-offset-2 hover:text-blue-950 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70"
                    >
                        {displayText(mdMatch[1])}
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
                                href={safeWebUrl(subPart) || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-800 underline underline-offset-2 hover:text-blue-950 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70 break-all"
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
                                    <strong key={`bold-${i}-${j}-${k}`} className="font-bold text-slate-950">
                                        {displayText(boldMatch[1])}
                                    </strong>
                                );
                            } else if (boldPart) {
                                elements.push(<span key={`text-${i}-${j}-${k}`}>{displayText(boldPart)}</span>);
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

    const applyProposals = useCallback(async (messageId: string, proposals: Proposal[]) => {
        const first = proposals[0];
        if (!first || applying.current.has(first.operationId)) return;
        applying.current.add(first.operationId);
        const setStatus = (status: ProposalStatus, result?: MutationResult) => setMessages(previous => previous.map(message => message.id === messageId ? {
            ...message, actions: message.actions?.map(proposal => proposal.operationId === first.operationId
                ? {...proposal,status,error:result && result.status !== 'applied' ? mutationMessage(result) : undefined}
                : result?.status === 'applied' && proposal.status === 'proposed' && proposal.expectedRevision === first.expectedRevision ? {...proposal,expectedRevision:result.revision} : proposal),
        } : message));
        setStatus('applying');
        try {
            if (proposals.length === 1 && first.change.kind === 'profile.patch' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const value = Object.values(first.change.patch).find(value => typeof value === 'string');
                if (typeof value === 'string') {
                    setIsTyping(true);
                    const words = value.split(' ');
                    for (let index = 1; index <= Math.min(words.length,40); index++) {
                        setActionPreview({operationId:first.operationId,text:words.slice(0,index).join(' ')});
                        await new Promise(resolve => setTimeout(resolve,20));
                    }
                    setActionPreview({operationId:first.operationId,text:value});
                }
            }
            if (!alive.current) return;
            const result = await applyOperation(proposals.map(proposal => proposal.change), first.operationId, first.expectedRevision);
            if (!alive.current) return;
            setStatus(result.status === 'applied' ? 'applied' : result.status === 'conflict' ? 'conflict' : result.status === 'outcomeUnknown' ? 'outcomeUnknown' : 'failed', result);
            if (result.status === 'applied') showToast('Profile updated', 'success');
        } catch {
            setStatus('failed',{status:'failed',operationId:first.operationId,revision:first.expectedRevision,changes:[]});
        } finally {
            applying.current.delete(first.operationId);
            setIsTyping(false);
        }
    }, [applyOperation, showToast]);

    const handleApplyAction = useCallback(async (messageId: string, action: Proposal) => {
        if (action.status === 'conflict') {
            await refreshProfile();
            const nextRevision = getRevision();
            setMessages(previous => previous.map(message => message.id === messageId ? {...message,actions:message.actions?.map(proposal => proposal.operationId === action.operationId ? {...proposal,operationId:crypto.randomUUID(),expectedRevision:nextRevision,status:'proposed' as const,error:undefined} : proposal)} : message));
            showToast('Latest profile loaded. Review the proposed change, then press Apply.', 'info');
            return;
        }
        const group = messages.find(message => message.id === messageId)?.actions?.filter(proposal => proposal.operationId === action.operationId) || [action];
        await applyProposals(messageId,group);
    }, [refreshProfile,getRevision,messages,applyProposals,showToast]);

    const handleRejectAction = (messageId: string, operationId: string) => {
        setMessages(previous => previous.map(message => message.id === messageId ? {...message,actions:message.actions?.map(proposal => proposal.operationId === operationId ? {...proposal,status:'rejected' as const} : proposal)} : message));
    };
    const handleUndo = async () => {
        const result = await undo();
        if (result.status === 'applied') {
            setMessages(previous => previous.map(message => ({...message,actions:message.actions?.map(proposal => proposal.operationId === result.originalOperationId ? {...proposal,status:'undone' as const} : proposal)})));
            showToast('Change undone and saved', 'success');
        } else showToast(mutationMessage(result),'error');
    };
    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;
        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        const requestRevision = revision;
        setIsCategoriesExpanded(false);
        setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'user',content:text,timestamp:Date.now()}]);
        setInputValue('');
        setIsLoading(true);
        try {
            const history = boundedChatHistory(messages);
            const {data:{session}, error: sessionError} = await supabase.auth.getSession();
            if (!alive.current || controller.signal.aborted) return;
            // The account UI and bearer must describe the same owner. A missing
            // or stale browser session must never turn a signed-in edit into a
            // guest answer (or send a different account's private conversation).
            if (sessionError || (userId ? !session?.access_token || session.user?.id !== userId : !!session?.access_token)) {
                setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'model',content:'Deity could not verify this signed-in account. Nothing was changed. Please sign in again before asking for a profile change.',timestamp:Date.now(),responseError:true}]);
                return;
            }
            const headers: Record<string,string> = {'Content-Type':'application/json'};
            if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
            const response = await fetch('/api/deity/chat',{method:'POST',headers,body:JSON.stringify({message:text,category:activeCategory,history,...(userId ? {expectedAccountId:userId} : {})}),signal:controller.signal});
            if (!alive.current || controller.signal.aborted) return;
            if (!response.ok) {
                const failure = await response.json().catch(() => ({}));
                if (!alive.current || controller.signal.aborted) return;
                setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'model',content:failure.error || 'AI chat is temporarily unavailable.',timestamp:Date.now(),responseError:true,allowanceCta:isDailyAllowanceCode(failure.code)}]);
                return;
            }
            if (!response.body) throw new Error('No response body');
            const botMessageId = crypto.randomUUID();
            setMessages(previous => [...previous,{id:botMessageId,role:'model',content:'',timestamp:Date.now()}]);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            try {
                for (;;) {
                    const {done,value} = await reader.read();
                    if (!alive.current || controller.signal.aborted) return;
                    if (done) break;
                    accumulated += decoder.decode(value,{stream:true});
                    const {message} = splitActionPayload(accumulated);
                    setMessages(previous => previous.map(item => item.id === botMessageId ? {...item,content:message} : item));
                }
                accumulated += decoder.decode();
            } finally { reader.releaseLock(); }
            if (!alive.current || controller.signal.aborted) return;
            const {message,actionsJson} = splitActionPayload(accumulated);
            let parsed: DeityAction[] | null = [];
            if (actionsJson) { try { parsed = parseActionList(JSON.parse(actionsJson)); } catch { parsed = null; } }
            if (!parsed) {
                setMessages(previous => previous.map(item => item.id === botMessageId ? {...item,content:message + '\n\nThat proposed change could not be read. Please ask me to try again.',responseError:true} : item));
                return;
            }
            // Every model change requires explicit review, including accounts
            // with a legacy fast-mode preference saved before its removal.
            const proposals: Proposal[] = parsed.map(action => ({...action,operationId:crypto.randomUUID(),expectedRevision:requestRevision,status:'proposed'}));
            setMessages(previous => previous.map(item => item.id === botMessageId ? {...item,content:message,actions:proposals} : item));
        } catch {
            if (alive.current && !controller.signal.aborted) setMessages(previous => [...previous,{id:crypto.randomUUID(),role:'model',content:'Deity could not finish that response. Please try again.',timestamp:Date.now(),responseError:true}]);
        } finally { if (alive.current && activeRequest.current === controller) setIsLoading(false); }
    },[revision,messages,supabase,userId,activeCategory]);

    const handleCategoryClick = useCallback((category: string) => {
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

        if (categoryReplyTimer.current !== null) clearTimeout(categoryReplyTimer.current);
        categoryReplyTimer.current = setTimeout(() => {
            categoryReplyTimer.current = null;
            if (!alive.current) return;
            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: botContent,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, botMsg]);
        }, 600); // Small natural delay
    }, []);

    // Handle an initial prompt only when it changes or initialization completes.
    // Declare this after the callbacks so it never reads an uninitialized const.
    useEffect(() => {
        if (initialMessage && hasInitialized && !isLoading && initialMessage !== consumedInitialMessage.current) {
            consumedInitialMessage.current = initialMessage;
            void handleSendMessage(initialMessage);
        }
        // The send callback is intentionally excluded so one initial message
        // cannot be replayed as chat state changes during streaming.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMessage, hasInitialized, isLoading]);

    useEffect(() => {
        if (!hasInitialized || isLoading || isTyping) return;
        const next = shortcutRequests.find(request => !consumedShortcuts.current.has(request.id));
        if (!next) return;
        consumedShortcuts.current.add(next.id);
        void handleSendMessage(next.message);
        // Consume each event id once; streaming rerenders must never replay it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shortcutRequests, hasInitialized, isLoading, isTyping]);

    const iconButtonClass = `${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full`;

    return (
        <section
            ref={shellRef}
            aria-label="Deity assistant"
            data-deity-surface="opaque"
            style={{ borderRadius: isFullScreen ? 0 : '32px 0 0 32px' }}
            className={`${LIGHT_PANEL.surface} group/deity relative isolate flex min-h-0 flex-col overflow-hidden max-md:!rounded-none ${isFullScreen
                ? 'h-full w-full border-none'
                : 'h-dvh w-full border border-white/80'
                }`}
        >
            <header ref={headerRef} className={`flex shrink-0 items-center justify-between gap-2 border-b border-slate-500/15 bg-[#eef0f4] px-3 pb-2 ${isFullScreen ? 'pt-2' : 'pt-[max(0.5rem,env(safe-area-inset-top))]'}`}>
                <div className="flex items-center gap-2">
                    <span className="block h-9 w-9 overflow-hidden rounded-full bg-[#e0e5ed] md:h-10 md:w-10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/nsso-agent-avatar.png"
                            alt="Deity Avatar"
                            className="h-full w-full object-cover"
                        />
                    </span>
                    <a
                        href="https://drive.google.com/file/d/1fRA7_xIrCw0XtOORljA3crcdSOCdFx3M/view?usp=sharing"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${LIGHT_PANEL.focus} rounded-sm transition-opacity hover:opacity-80`}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/deity logo white.png"
                            alt="Deity"
                            className="h-7 w-auto translate-y-1 object-contain brightness-0 md:h-8"
                        />
                    </a>
                </div>
                <div className="flex items-center gap-1.5 md:gap-2">
                    {!isFullScreen && onMaximize && (
                        <button
                            type="button"
                            onClick={onMaximize}
                            aria-label="Expand Deity chat"
                            title="Expand chat"
                            className={`${iconButtonClass} hidden md:inline-flex`}
                        >
                            <Maximize2 size={18} />
                        </button>
                    )}
                    {isFullScreen && onMinimize && (
                        <button
                            type="button"
                            onClick={onMinimize}
                            aria-label="Minimize Deity chat"
                            title="Minimize chat"
                            className={iconButtonClass}
                        >
                            <Minimize2 size={18} />
                        </button>
                    )}

                    {canUndo && (
                        <button
                            type="button"
                            onClick={handleUndo}
                            aria-label="Undo last profile change"
                            title="Undo last change"
                            className={iconButtonClass}
                        >
                            <RotateCcw size={18} />
                        </button>
                    )}

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close Deity chat"
                            title="Close chat"
                            className={iconButtonClass}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </header>

            <div
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-400/50 group-data-[compact=true]/deity:p-2 group-data-[minimal=true]/deity:py-0"
            >
                {messages.map((msg) => (
                    <div key={msg.id} className="flex flex-col gap-2">
                        <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.content.trim() && (
                                <article
                                    aria-label={`${msg.role === 'user' ? 'Your' : 'Deity'} message`}
                                    style={{ borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}
                                    className={`max-w-[95%] px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap md:max-w-[90%] ${msg.role === 'user'
                                        ? 'border border-white/80 bg-[#dfe8f2] text-slate-950'
                                        : 'border border-white/80 bg-[#f8f9fb] text-slate-800'
                                        }`}
                                >
                                    {renderMessage(msg.content, msg.role === 'model')}
                                    {msg.allowanceCta && <a href={ALLOWANCE_CTA_URL} target="_blank" rel="noopener noreferrer"
                                        className={`${LIGHT_PANEL.focus} mt-3 block rounded-sm font-semibold text-blue-800 underline underline-offset-4 hover:text-blue-950`}>{ALLOWANCE_CTA_LABEL}</a>}
                                </article>
                            )}
                        </div>

                        {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                            <div className="flex justify-start"><div className="flex max-w-[95%] flex-wrap gap-2 md:max-w-[90%]">
                                {msg.actions.map((action,idx) => <div key={`${action.operationId}-${idx}`} className={`${LIGHT_PANEL.group} space-y-2 rounded-xl px-3 py-2 text-sm`}>
                                    <p className="text-xs text-slate-700">{action.label}</p>
                                    <details className="text-xs text-slate-600"><summary>Review proposed values</summary><dl className="max-h-48 max-w-full overflow-auto whitespace-pre-wrap">{'patch' in action.change || 'values' in action.change ? Object.entries('patch' in action.change ? action.change.patch : action.change.values).map(([field,value])=><div key={field} className="mt-2"><dt className="capitalize text-slate-800">{field.replaceAll('_',' ')}</dt><dd>{value===null || value==='' ? '(clear this value)' : String(value)}</dd></div>) : action.change.kind==='collection.reorder' ? <div><dt>New order</dt><dd>{action.change.order.map(id=>links?.find(link=>link.id===id)?.link_name || 'Saved link').join(' → ')}</dd></div> : action.change.kind==='link.remove' ? <div><dt>Remove link</dt><dd>{links?.find(link=>'id' in action.change && link.id===action.change.id)?.link_name || 'Selected link'}</dd></div> : null}</dl></details>
                                    {actionPreview?.operationId === action.operationId && <p className="max-h-36 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{actionPreview.text}</p>}
                                    {action.status === 'applied' ? <div role="status" className="flex items-center gap-1 text-xs text-emerald-800"><Check size={14}/>Done, profile updated!</div>
                                    : action.status === 'undone' ? <p role="status" className="text-xs text-slate-600">Undone and saved.</p>
                                    : action.status === 'rejected' ? <p role="status" className="text-xs text-slate-600">Rejected</p>
                                    : action.status === 'applying' ? <p role="status" className="text-xs text-sky-900">Saving change...</p>
                                    : <><button type="button" disabled={isTyping} aria-label="Apply suggested profile change" onClick={() => {void handleApplyAction(msg.id,action)}} className={`${LIGHT_PANEL.focus} inline-flex min-h-11 items-center gap-1 rounded-full border border-sky-200 bg-[#dceaf5] px-3 text-xs font-medium text-sky-950 transition-colors hover:bg-[#c9e0f2] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none`}><Check size={14}/>{action.status === 'conflict' ? 'Refresh for review' : action.status === 'outcomeUnknown' ? 'Check save status' : action.status === 'failed' ? 'Retry' : 'Apply'}</button>{action.status!=='outcomeUnknown' && <button type="button" aria-label="Reject suggested profile change" onClick={() => handleRejectAction(msg.id,action.operationId)} className={`${LIGHT_PANEL.focus} ml-2 inline-flex min-h-11 items-center gap-1 rounded-full border border-rose-200 bg-[#f9e5e9] px-3 text-xs text-rose-900 transition-colors hover:bg-[#f5d6df] motion-reduce:transition-none`}><XCircle size={14}/>Reject</button>}</>}
                                    {action.error && <p role="status" className="max-w-md text-xs text-amber-900">{action.error}</p>}
                                </div>)}
                            </div></div>
                        )}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div
                            role="status"
                            aria-label="Deity is responding"
                            className="flex gap-1.5 rounded-[16px_16px_16px_4px] border border-white/80 bg-[#f8f9fb] px-3 py-2"
                        >
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600 motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600 motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-600 motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <footer className="w-full shrink-0 border-t border-slate-500/15 bg-[#eef0f4]">
                <div ref={categoryToggleRef} className="px-3 pt-1 group-data-[minimal=true]/deity:hidden">
                    <div className="flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => setIsCategoriesExpanded(!isCategoriesExpanded)}
                            aria-expanded={isCategoriesExpanded}
                            aria-controls="deity-category-options"
                            className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-medium uppercase tracking-wider`}
                        >
                            What you can ask me about
                            {isCategoriesExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </div>
                </div>

                <div
                    ref={categoryOptionsRef}
                    id="deity-category-options"
                    aria-hidden={!isCategoriesExpanded}
                    inert={!isCategoriesExpanded}
                    className={`overflow-y-auto overscroll-contain transition-opacity duration-150 motion-reduce:transition-none group-data-[minimal=true]/deity:hidden ${isCategoriesExpanded ? 'max-h-[min(220px,30dvh)] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                    <div className="flex flex-wrap justify-center gap-1.5 overflow-y-auto px-3 pb-1 scrollbar-none">
                        {Object.keys(CATEGORY_QUESTIONS).map(cat => (
                            <button
                                type="button"
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                aria-pressed={activeCategory === cat}
                                className={`${LIGHT_PANEL.focus} mb-1 min-h-11 rounded-full border px-3 py-2 text-xs font-medium transition-colors motion-reduce:transition-none ${activeCategory === cat
                                    ? 'border-slate-400 bg-[#dce4ef] text-slate-950'
                                    : 'border-white/80 bg-[#f4f5f8] text-slate-700 hover:bg-white hover:text-slate-950'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                        <button
                            type="button"
                            ref={databaseTriggerRef}
                            className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} mb-1 min-h-11 rounded-full px-3 py-2 text-xs font-bold tracking-wide`}
                            onClick={() => setShowVennDiagram(true)}
                            aria-expanded={showVennDiagram}
                            aria-controls="deity-database-tooltip"
                            aria-haspopup="dialog"
                        >
                            nsso DATABASE
                        </button>
                    </div>
                </div>

                <div ref={composerAreaRef} className="px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
                    <form
                        onSubmit={(e) => { e.preventDefault(); if (!isLoading) void handleSendMessage(inputValue); }}
                        className="group relative"
                    >
                        <label htmlFor="deity-message-input" className="sr-only">Message Deity</label>
                        <textarea
                            ref={composerRef}
                            id="deity-message-input"
                            rows={1}
                            value={inputValue}
                            maxLength={4000}
                            onChange={(e) => setInputValue(e.target.value)}
                            onFocus={() => setIsCategoriesExpanded(false)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                                    event.preventDefault();
                                    if (!isLoading) void handleSendMessage(inputValue);
                                }
                            }}
                            placeholder="Message Deity…"
                            autoComplete="off"
                            className="block max-h-40 min-h-14 w-full resize-none overflow-y-auto rounded-2xl border border-slate-400/70 bg-[#fbfcfe] px-3 py-3 pr-14 text-base leading-6 text-slate-950 outline-none placeholder:text-slate-600 focus:border-slate-700 focus:ring-2 focus:ring-slate-700/25"
                        />
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || isLoading}
                            aria-label="Send message"
                            className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} absolute bottom-1.5 right-1.5 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full`}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </footer>

            {showVennDiagram && createPortal(
                <dialog
                    ref={databaseDialogRef}
                    id="deity-database-tooltip"
                    aria-label="About the nsso database"
                    onCancel={(event) => { event.preventDefault(); closeDatabase(); }}
                    onClose={closeDatabase}
                    className={`${LIGHT_PANEL.surface} fixed inset-0 z-[9999] m-auto max-h-[90dvh] w-[min(900px,94vw)] max-w-[94vw] overflow-auto rounded-2xl border border-white/80 p-3 shadow-2xl backdrop:bg-slate-950/60`}
                >
                    <div className="mb-3 flex items-center justify-between gap-4"><h2 className="font-semibold">The nsso database</h2><button type="button" aria-label="Close database information" onClick={closeDatabase} className={iconButtonClass}><X size={20}/></button></div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/nsso-venn-diagram.jpg"
                        alt="nsso Agent vs ChatGPT Venn Diagram"
                        className="mx-auto block max-h-[calc(90dvh-6rem)] max-w-full rounded-xl object-contain"
                    />
                </dialog>,
                document.body
            )}
        </section>
    );
}
