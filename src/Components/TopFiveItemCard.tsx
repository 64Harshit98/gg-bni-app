import React from 'react';
import { FiPackage } from 'react-icons/fi';
import { RankCard, type RankItem } from './Rankcard';

export const TopSoldItemsCard: React.FC<{ isDataVisible: boolean; items: RankItem[] }> = ({ isDataVisible, items }) => (
  <RankCard
    title="Top items" items={items} isDataVisible={isDataVisible}
    emptyIcon={<FiPackage />} emptyTitle="No items sold yet" emptyText="Make a bill and your best sellers will show up here."
  />
);