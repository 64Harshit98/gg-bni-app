import { useState } from 'react';

const BuggyButton = () => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    // Simulate a JS error during rendering
    throw new Error('I crashed!');
  }

  return (
    <button
      onClick={() => setHasError(true)}
      className="bg-red-600 text-white p-4 rounded shadow-lg m-4"
    >
      Click me to Crash App
    </button>
  );
};

export default BuggyButton;