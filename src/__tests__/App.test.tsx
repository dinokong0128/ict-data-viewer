/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import App from '@/pages/_app';

const mockUseAuth = jest.fn();

// Mock auth-context so the RouteGuard doesn't hit real Supabase
jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuth(),
}));

// Mock next/router
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/', replace: jest.fn(), push: jest.fn() }),
}));

describe('App', () => {
  it('renders the page component when guest', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, session: null, isGuest: true });
    const Component = () => <div>Page content</div>;
    render(<App Component={Component} pageProps={{}} />);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('suppresses content while auth is loading', () => {
    mockUseAuth.mockReturnValue({ isLoading: true, session: null, isGuest: false });
    const Component = () => <div>Protected content</div>;
    render(<App Component={Component} pageProps={{}} />);
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders content when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      session: { access_token: 'tok' },
      isGuest: false,
    });
    const Component = () => <div>Dashboard</div>;
    render(<App Component={Component} pageProps={{}} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
