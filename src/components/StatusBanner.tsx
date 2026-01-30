import React from 'react';

type StatusBannerProps = {
  message: string | null;
};

export function StatusBanner({ message }: StatusBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <section className="section status" aria-live="polite">
      {message}
    </section>
  );
}
