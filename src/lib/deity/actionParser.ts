/**
 * Deity Action Parser
 * Extracts structured JSON commands from LLM streaming responses
 */

export type DeityActionType =
    | 'UPDATE_FIELD'
    | 'ADD_LINK'
    | 'UPDATE_LINK'
    | 'REMOVE_LINK'
    | 'REORDER_LINKS'
    | 'ADD_EXPERIENCE'
    | 'ADD_PROJECT'
    | 'ADD_QUALIFICATION'
    | 'ADD_PRODUCT'
    | 'SUGGEST_WORDING'

export interface DeityAction {
    action: DeityActionType

    // For UPDATE_FIELD
    target?: 'bio' | 'headline' | 'full_name'
    value?: string
    isPlaceholder?: boolean

    // For ADD_LINK / UPDATE_LINK
    name?: string
    url?: string
    linkId?: string

    // For REMOVE_LINK
    id?: string

    // For REORDER_LINKS
    order?: string[] // Array of link IDs in desired order

    // For ADD_EXPERIENCE
    company?: string
    title?: string
    description?: string
    years?: string
    startYear?: number
    endYear?: number | null

    // For ADD_PROJECT
    project_name?: string
    project_description?: string
    project_url?: string
    technologies?: string[]

    // For ADD_QUALIFICATION
    institution?: string
    degree?: string
    field?: string
    year?: number

    // For ADD_PRODUCT
    product_name?: string
    product_description?: string
    price?: string
    purchase_url?: string

    // For SUGGEST_WORDING
    original?: string
    improved?: string
    reasoning?: string

    // Metadata
    timestamp?: number
}

export interface ParsedResponse {
    message: string // The conversational text
    actions: DeityAction[] // Extracted actions
}

/**
 * Extract Deity action commands from LLM response
 * Actions are embedded as JSON blocks in triple backticks
 */
export function extractActions(fullResponse: string): DeityAction[] {
    const actions: DeityAction[] = []

    // Match JSON blocks in triple backticks: ```json\n{...}\n```
    const regex = /```json\s*\n({[\s\S]*?})\s*\n```/g
    let match

    while ((match = regex.exec(fullResponse)) !== null) {
        try {
            const actionObj = JSON.parse(match[1])

            // Validate it has required 'action' field
            if (actionObj.action) {
                actions.push({
                    ...actionObj,
                    timestamp: Date.now()
                })
            }
        } catch (e) {
            console.error('Failed to parse Deity action:', e)
            console.error('Attempted to parse:', match[1])
        }
    }

    return actions
}

/**
 * Parse full response into message + actions
 * Strips action blocks from the conversational message
 */
export function parseResponse(fullResponse: string): ParsedResponse {
    const actions = extractActions(fullResponse)

    // Remove JSON blocks from message to avoid displaying them twice
    const message = fullResponse.replace(/```json\s*\n{[\s\S]*?}\s*\n```/g, '').trim()

    return {
        message,
        actions
    }
}

/**
 * Create the special delimiter payload for streaming
 * This is appended at the end of the response stream
 */
export function createActionPayload(actions: DeityAction[]): string {
    if (actions.length === 0) return ''

    return `\n__DEITY_ACTIONS__\n${JSON.stringify(actions)}\n`
}

/**
 * Check if a chunk contains the action delimiter
 */
export function containsActionDelimiter(text: string): boolean {
    return text.includes('__DEITY_ACTIONS__')
}

/**
 * Split accumulated text into message and action payload
 */
export function splitActionPayload(text: string): { message: string; actionsJson: string | null } {
    if (!containsActionDelimiter(text)) {
        return { message: text, actionsJson: null }
    }

    const parts = text.split('__DEITY_ACTIONS__')
    return {
        message: parts[0],
        actionsJson: parts[1] || null
    }
}

/**
 * Validate action object has required fields
 */
export function isValidAction(action: any): action is DeityAction {
    if (!action || typeof action !== 'object') return false
    if (!action.action || typeof action.action !== 'string') return false

    // Type-specific validation
    switch (action.action) {
        case 'UPDATE_FIELD':
            return !!action.target && !!action.value
        case 'ADD_LINK':
            return !!action.name && !!action.url
        case 'UPDATE_LINK':
            return !!action.linkId && (!!action.name || !!action.url)
        case 'REMOVE_LINK':
            return !!action.id
        case 'REORDER_LINKS':
            return Array.isArray(action.order) && action.order.length > 0
        case 'ADD_EXPERIENCE':
            return !!action.company && !!action.title
        case 'ADD_PROJECT':
            return !!action.project_name && !!action.project_description
        case 'ADD_QUALIFICATION':
            return !!action.institution && !!action.degree
        case 'ADD_PRODUCT':
            return !!action.product_name && !!action.product_description
        case 'SUGGEST_WORDING':
            return !!action.target && !!action.improved
        default:
            return false
    }
}
