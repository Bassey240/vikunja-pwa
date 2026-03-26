import {createRoot} from 'react-dom/client'
import App from './App'
import {useAppStore} from './store'
import './styles.css'

createRoot(document.getElementById('app')!).render(<App />)
void useAppStore.getState().initRuntime()
