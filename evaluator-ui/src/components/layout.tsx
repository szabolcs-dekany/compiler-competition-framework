import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const navItems = [
    { href: '/teams', label: 'Teams' },
    { href: '/submissions', label: 'Submissions' },
    { href: '/test-cases', label: 'Test Cases' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center px-4">
          <Link to="/" className="text-xl font-bold">
            Evaluator
          </Link>
          <nav className="ml-8 flex gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  currentPath === item.href || (item.href === '/teams' && currentPath === '/')
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
