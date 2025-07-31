// src/constants/models.ts

export interface Item {
  id?: string; // Optional: Firestore document ID
  name: string;
  mrp: number; // Renamed from 'price' to 'mrp' to match your form
  purchasePrice: number;
  discount: number; // Store as a number (e.g., 0.10 for 10%, or 10 for 10%)
  tax: number; // Store as a number (e.g., 0.18 for 18%, or 18 for 18%)
  itemGroupId: string; // Link to ItemGroup. This will be derived from 'Category'
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  // Add any other properties your items might have
}

export interface ItemGroup {
  id?: string; // Optional: Firestore document ID
  name: string;
  description: string;
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  // Add any other properties your item groups might have
}