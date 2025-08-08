import React from 'react';
import { iconMap } from './icon.map';

type IconName = keyof typeof iconMap;

interface CustomIconProps {
  iconName: IconName;
  size?: number;
}

const CustomIcon: React.FC<CustomIconProps> = ({ iconName, size = 14 }) => {
  const iconPath = iconMap[iconName];

  if (!iconPath) {
    return null;
  }

  return (
    <img
      src={iconPath}
      alt={`${iconName} icon`}
      style={{ width: size, height: size }}
    />
  );
};

export default CustomIcon;
