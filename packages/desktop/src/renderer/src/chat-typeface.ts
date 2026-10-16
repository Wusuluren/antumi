import { usePreferences } from './preferences'
import { cssFontFamily } from './system-fonts'

// The chat's type from the settings, as the attributes a .chat-view reads: every view of a chat (a
// conversation, a new one's draft, the helper's) sets its messages alike.
export function useChatTypeface() {
  const size = usePreferences((s) => s.chatFontSize)
  const font = usePreferences((s) => s.chatFont)
  const family = usePreferences((s) => s.chatFontFamily)
  // A family picked from those installed goes in as a property, which the stylesheet puts first.
  const custom = font === 'custom' && family ? cssFontFamily(family) : null
  return {
    'data-font-size': size,
    'data-font': font === 'custom' && !custom ? 'system' : font,
    style: custom ? { '--chat-font-custom': custom } : undefined
  }
}
