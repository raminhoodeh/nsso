'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { boundedClientRead } from '@/lib/client-read'
import { validateProfileUsername } from '@/lib/profile-username'
import Input from '@/components/ui/Input'
import GlassButton from '@/components/ui/GlassButton'

const DRAFT_KEY = 'nsso-profile-name-draft'

export default function HomeProfileClaim() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const id = useId()
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [invalid, setInvalid] = useState(false)
  const pending = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    // Keep the server-rendered controls disabled until their handlers and the
    // optional saved draft are ready together. An early edit must never be
    // overwritten by this browser-only synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setName(sessionStorage.getItem(DRAFT_KEY) || '') } catch { /* Private browsing can disable storage. */ }
    setReady(true)
    const requestEpoch = generation
    return () => { requestEpoch.current++ }
  }, [])

  const updateName = (value: string) => {
    setName(value)
    setInvalid(false)
    setFeedback('')
    try { sessionStorage.setItem(DRAFT_KEY, value) } catch { /* The React draft remains available. */ }
  }

  const continueToSignup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready || pending.current) return
    const validated = validateProfileUsername(name.trim())
    if ('error' in validated) {
      setInvalid(true)
      setFeedback(validated.error)
      return
    }
    const request = ++generation.current
    pending.current = true
    setBusy(true)
    setInvalid(false)
    setFeedback('Checking availability…')
    try {
      const response = await fetch(`/api/check-username?username=${encodeURIComponent(validated.username)}`, {
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      })
      const result = await response.json()
      if (request !== generation.current) return
      if (!response.ok) throw new Error('availability')
      if (result.available !== true) {
        setInvalid(true)
        setFeedback(result.reason || 'This name is already taken. Try another name.')
        return
      }
      setName(validated.username)
      try { sessionStorage.setItem(DRAFT_KEY, validated.username) } catch { /* Optional draft persistence. */ }
      setFeedback('Available now. Save this name in profile setup to claim it.')
      const { data: { session }, error } = await boundedClientRead(() => supabase.auth.getSession())
      if (request !== generation.current) return
      if (error) throw error
      router.push(session ? `/dashboard?claim=${encodeURIComponent(validated.username)}` : `/sign-up?name=${encodeURIComponent(validated.username)}`)
    } catch {
      if (request === generation.current) setFeedback('We could not check availability or open setup. Your name is kept; please try again.')
    } finally {
      if (request === generation.current) { pending.current = false; setBusy(false) }
    }
  }

  return (
    <form id="choose-profile-name" onSubmit={continueToSignup} aria-busy={!ready || busy} className="mx-auto w-full max-w-xl scroll-mt-32 space-y-4 text-left text-slate-950" aria-label="Choose your profile name">
      <Input
        id={id}
        label="Choose your nsso profile name"
        prefix="nsso.me/"
        tone="dark"
        aria-label="Profile name"
        aria-describedby={`${id}-status`}
        aria-invalid={invalid}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="username"
        spellCheck={false}
        maxLength={30}
        value={name}
        onChange={event => updateName(event.target.value)}
        disabled={!ready || busy}
        placeholder="yourname"
      />
      <GlassButton type="submit" variant="shiny" fullWidth tone="dark" disabled={!ready || busy} aria-busy={!ready || busy}>
        {!ready ? 'LOADING…' : busy ? 'CHECKING…' : 'CLAIM IT'}
      </GlassButton>
      <p id={`${id}-status`} role="status" aria-live="polite" className={`text-sm leading-5 empty:hidden ${invalid ? 'font-medium text-rose-950' : 'text-slate-950/80'}`}>{ready ? feedback : 'Preparing your profile name…'}</p>
    </form>
  )
}
