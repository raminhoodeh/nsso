import { InputHTMLAttributes, forwardRef } from 'react'
import { TahoeGlassField } from '@/components/ui/tahoe-glass'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    prefix?: string
    error?: string
}

interface InputControlProps extends InputHTMLAttributes<HTMLInputElement> {
    prefix?: string
}

const InputControl = forwardRef<HTMLInputElement, InputControlProps>(({
    prefix,
    className = '',
    ...props
}, ref) => (
    <span className="flex w-full items-center">
        {prefix && (
            <span className="relative z-10 whitespace-nowrap pl-0.5 text-[17px] font-medium text-white">
                {prefix}
            </span>
        )}
        <input ref={ref} className={className} {...props} />
    </span>
))

InputControl.displayName = 'InputControl'

/** Recessed input field backed by the shared Tahoe field primitive. */
const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    prefix,
    error,
    className = '',
    ...props
}, ref) => {
    return (
        <TahoeGlassField
            className="w-full [&>p[role=alert]]:mt-1 [&>p[role=alert]]:text-[13px] [&>p[role=alert]]:text-red-400"
            label={label || undefined}
            labelClassName="mb-2 text-[13px] font-medium text-white/70"
            error={error || undefined}
            tone="light"
            surfaceClassName={`${error ? 'ring-2 ring-red-400' : ''} ${className}`}
            controlClassName={`
                flex-1 border-none py-0 text-[17px] font-medium leading-[22px]
                placeholder:text-white/50
                ${prefix ? 'pl-1 pr-0.5' : 'px-0.5'}
            `}
        >
            <InputControl ref={ref} prefix={prefix} {...props} />
        </TahoeGlassField>
    )
})

Input.displayName = 'Input'

export default Input
