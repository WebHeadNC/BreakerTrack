import { useEffect, useState } from 'react'

const QUERY = '(max-width: 820px)'

/** Reactive check for a phone/narrow viewport, driving layout swaps. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    // Fallback: some environments don't fire matchMedia 'change' on resize.
    window.addEventListener('resize', onChange)
    onChange()
    return () => {
      mql.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return isMobile
}
