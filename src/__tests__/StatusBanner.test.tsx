import { render, screen } from '@testing-library/react';
import { StatusBanner } from '@/components/StatusBanner';

describe('StatusBanner', () => {
  it('renders message when provided', () => {
    render(<StatusBanner message="Loading" />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('renders nothing when message is null', () => {
    const { container } = render(<StatusBanner message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
