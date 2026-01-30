import { render, screen } from '@testing-library/react';
import App from '@/pages/_app';

describe('App', () => {
  it('renders the page component', () => {
    const Component = () => <div>Page content</div>;
    render(<App Component={Component} pageProps={{}} />);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
