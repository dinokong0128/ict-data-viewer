import React from 'react';

type ErrorSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ErrorSearchInput({ value, onChange }: ErrorSearchInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search errors..."
      className="header-select"
      aria-label="Search errors"
      style={{ fontSize: '12px' }}
    />
  );
}
