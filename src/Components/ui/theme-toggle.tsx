import { Moon, Sun } from 'lucide-react';

import { Button } from './button';
import { useTheme } from '../../context/theme-context';

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
      className={className}
    >
      {isDark ? (
        <Moon className="size-4 transition-transform" />
      ) : (
        <Sun className="size-4 transition-transform" />
      )}
    </Button>
  );
}

export { ThemeToggle };
