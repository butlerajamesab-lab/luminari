import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Scale } from 'lucide-react';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <Scale className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-4xl font-serif text-foreground mb-2">404</h1>
        <p className="text-muted-foreground mb-6">Page not found.</p>
        <Button onClick={() => setLocation('/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
