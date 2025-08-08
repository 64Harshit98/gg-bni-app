import React from 'react';
import sellarLogo from '../../assets/sellar-logo.png';
import bgMain from '../../assets/bg-main.png';

const Loading: React.FC = () => {
  return (
    <div
      className="relative h-screen w-screen bg-cover bg-center md:bg-[center_top_60%]"
      style={{ backgroundImage: `url(${bgMain})` }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={sellarLogo}
          alt="Sellar Logo"
          className="w-32 h-32 md:w-48 md:h-48"
        />
      </div>
    </div>
  );
};

export default Loading;
