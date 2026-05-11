import { create } from 'zustand';

interface PropertyState {
  title: string | null;
  setTitle: (title: string) => void;
}

export const useProperty = create<PropertyState>((set) => ({
  title: null,
  setTitle: (title) => set({ title }),
}));