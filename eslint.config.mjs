import nextConfig from 'eslint-config-next';

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // These are legitimate patterns:
      // - Data fetching in useEffect on mount
      // - Derived state calculations based on prop/state changes
      'react-hooks/set-state-in-effect': 'off'
    }
  }
];

export default eslintConfig;
