import {createContext} from 'react'

// True when the surrounding workspace screen is the visible one. Kept-warm
// hidden screens set this false so their rows don't render duplicate menu
// portals (menus portal to <body>, escaping the hidden screen's wrapper).
// Defaults to true for contexts with no workspace screen (detail, previews).
export const ScreenActiveContext = createContext(true)
