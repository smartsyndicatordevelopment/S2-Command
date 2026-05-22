import { createContext, useContext, useState, useEffect } from 'react';

export const AppContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  isDemo: false,
  toggleDemo: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [theme, setTheme] = useState('dark');
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const toggleDemo  = () => setIsDemo(d => !d);

  return (
    <AppContext.Provider value={{ theme, toggleTheme, isDemo, toggleDemo }}>
      {children}
    </AppContext.Provider>
  );
}
