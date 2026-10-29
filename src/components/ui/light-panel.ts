// Reading panels use an opaque base so the scene behind them cannot reduce
// text contrast. Share the mobile menu's pastel white material, without
// registering another refracting glass surface.
export const LIGHT_PANEL = {
    surface: 'bg-[#e3e7ed] bg-[linear-gradient(155deg,rgba(255,255,255,0.45),rgba(226,226,237,0.65)_48%,rgba(236,224,226,0.85))] text-slate-950 [text-shadow:none] [color-scheme:light]',
    content: 'text-slate-950 [text-shadow:none] [color-scheme:light] [&_[data-tahoe-button-content]]:[text-shadow:none]',
    overlayBacking: 'before:bg-[#e3e7ed] before:bg-[linear-gradient(155deg,rgba(255,255,255,0.45),rgba(226,226,237,0.65)_48%,rgba(236,224,226,0.85))]',
    group: 'border border-white/80 bg-[#f0f2f6] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_3px_10px_rgba(30,41,59,0.04)]',
    control: 'nsso-glass-control border border-white/80 text-slate-950 transition-colors disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none',
    focusWithin: '[&_:is(button,a,input,textarea,select,summary):focus-visible]:outline-solid [&_:is(button,a,input,textarea,select,summary):focus-visible]:outline-2 [&_:is(button,a,input,textarea,select,summary):focus-visible]:outline-offset-2 [&_:is(button,a,input,textarea,select,summary):focus-visible]:outline-slate-950',
    focus: 'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70',
} as const
