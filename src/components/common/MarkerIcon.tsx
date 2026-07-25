import { HelpCircle } from 'lucide-react'
import type { IconType } from '../../types'
import { getBuiltinIcon } from '../../lib/builtinIcons'
import { blobUrl } from '../../lib/api'

interface Props {
  icon: IconType | undefined
  size?: number
}

/** Renders a catalog icon: a built-in Lucide glyph or an uploaded image. */
export default function MarkerIcon({ icon, size = 20 }: Props) {
  if (!icon) return <HelpCircle size={size} />

  if (icon.source === 'upload') {
    if (!icon.imageId) {
      return <span style={{ width: size, height: size, display: 'inline-block' }} />
    }
    return (
      <img
        src={blobUrl(icon.imageId)}
        alt={icon.name}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block' }}
        draggable={false}
      />
    )
  }

  const builtin = getBuiltinIcon(icon.builtinKey)
  const Comp = builtin?.Comp ?? HelpCircle
  return <Comp size={size} />
}
