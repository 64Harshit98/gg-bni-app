import React from 'react';
import { FiUsers, FiUserPlus } from 'react-icons/fi';
import { Permissions } from '../enums';
import { RankCard, type RankItem } from './Rankcard'

export const TopSalespersonCard: React.FC<{ isDataVisible: boolean; salesmen: RankItem[]; addUserRoute?: string }> = ({ isDataVisible, salesmen, addUserRoute }) => (
  <RankCard
    title="Top salespeople" items={salesmen} isDataVisible={isDataVisible}
    emptyIcon={<FiUsers />} emptyTitle="No salespeople yet"
    emptyText="Add staff and pick them on a bill to see who sells most."
    emptyAction={addUserRoute ? { label: 'Add user', to: addUserRoute, icon: <FiUserPlus size={16} />, permission: Permissions.CreateUsers } : undefined}
  />
);