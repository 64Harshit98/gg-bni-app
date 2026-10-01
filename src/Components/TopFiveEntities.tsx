import React from 'react';
import { FiUsers } from 'react-icons/fi';
import { RankCard, type RankItem } from './Rankcard';

export const TopEntitiesList: React.FC<{ isDataVisible: boolean; titleOverride?: string; items: RankItem[] }> = ({ isDataVisible, titleOverride, items }) => (
  <RankCard
    title={titleOverride || 'Top entities'} items={items} isDataVisible={isDataVisible}
    emptyIcon={<FiUsers />} emptyTitle="No customers yet" emptyText="Add a customer name on a bill to see your best buyers."
  />
);