import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    prefix?: string
    error?: string
}

/**
 * Recessed input field matching NSSO Figma design
 * Supports optional prefix (e.g., "nsso.me/") and labels
 */
const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    prefix,
    error,
    className = '',
    ...props
}, ref) => {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-white/70 text-[13px] font-medium mb-2">
                    {label}
                </label>
            )}

            <div
                className={`
          relative flex items-center rounded-[12px] overflow-hidden
          ${error ? 'ring-2 ring-red-400' : ''}
          ${className}
        `}
            >
                {/* Recessed background layers */}
                <div
                    className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px] pointer-events-none"
                    aria-hidden="true"
                />
                <div
                    className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px] pointer-events-none"
                    aria-hidden="true"
                />

                {/* Inner shadow */}
                <div
                    className="absolute inset-0 pointer-events-none rounded-[12px]"
                    style={{
                        boxShadow: `
              inset 0px -0.5px 1px 0px rgba(255, 255, 255, 0.3),
              inset 0px -0.5px 1px 0px rgba(255, 255, 255, 0.25),
              inset 1px 1.5px 4px 0px rgba(0, 0, 0, 0.08),
              inset 1px 1.5px 4px 0px rgba(0, 0, 0, 0.1)
            `
                    }}
                    aria-hidden="true"
                />

                {/* Prefix */}
                {prefix && (
                    <span className="relative z-10 pl-4 text-[#545454] text-[17px] font-medium whitespace-nowrap">
                        {prefix}
                    </span>
                )}

                {/* Input field */}
                <input
                    ref={ref}
                    className={`
            relative z-10 flex-1 bg-transparent border-none outline-none
            text-[#545454] text-[17px] font-medium leading-[22px]
            py-3 ${prefix ? 'pl-1 pr-4' : 'px-4'}
            placeholder:text-[rgba(84,84,84,0.5)]
          `}
                    {...props}
                />
            </div>

            {error && (
                <p className="mt-1 text-red-400 text-[13px]">{error}</p>
            )}
        </div>
    )
})

Input.displayName = 'Input'

export default Input
