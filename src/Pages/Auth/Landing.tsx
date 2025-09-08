import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';
import { CustomButton } from '../../Components';
import sellarLogo from '../../assets/sellar-logo-heading.png';
import bgMain from '../../assets/bg-main.png';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="relative h-screen w-screen bg-cover bg-center md:bg-[center_top_75%]"
      style={{ backgroundImage: `url(${bgMain})` }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex-grow flex items-center justify-center">
          <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
        </div>
        <div className="w-full bg-white p-6 py-10 shadow-t-lg">
          <div className="flex w-full max-w-sm mx-auto space-x-4">
            <CustomButton
              variant="outline"
              onClick={() => navigate(ROUTES.LOGIN)}
              className="flex-1"
            >
              LOG IN
            </CustomButton>
            <CustomButton
              variant="filled"
              onClick={() => navigate(ROUTES.BUSINESS_INFO)}
              className="flex-1"
            >
              REGISTER
            </CustomButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
