import { type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Scale, LayoutDashboard, BookOpen, Shield, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Cases', icon: LayoutDashboard },
    { path: '/resources', label: 'Resources', icon: BookOpen },
    { path: '/safety', label: 'Safety', icon: Shield },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <button
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Scale className="w-5 h-5 text-primary" />
              <span className="font-serif text-lg text-foreground">Esquire</span>
            </button>

            {/* Nav Links */}
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.startsWith(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => setLocation(item.path)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Sign Out */}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-around h-14">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-20 sm:pb-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
