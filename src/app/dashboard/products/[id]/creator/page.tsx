'use client'

import { useParams } from 'next/navigation'
import SalesPageCreator from '@/components/products/SalesPageCreator'

/** Direct links keep working; the profile editor can host the same creator in place. */
export default function SalesPageCreatorPage() {
    const params = useParams()
    const productId = typeof params.id === 'string' ? params.id : ''
    return <SalesPageCreator key={productId} productId={productId} />
}
