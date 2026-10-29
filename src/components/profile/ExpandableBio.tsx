import ExpandableProfileText from './ExpandableProfileText'

interface ExpandableBioProps {
    text: string
    collapsedText?: string
    className?: string
}

export default function ExpandableBio({ text, className }: ExpandableBioProps) {
    return <ExpandableProfileText text={text} context="bio" className={className} />
}
