import { useColorScheme } from 'react-native';

const light = {
  bg: '#F5F3EE', card: '#FFFFFF', ink: '#1C1D1B', muted: '#7A7C76', line: '#E7E4DC',
  accent: '#3F6B58', accentSoft: '#E3ECE6', onAccent: '#FFFFFF', warn: '#B5622E', danger: '#B3372F', track: '#ECE9E1',
};
export type Palette = typeof light;
const dark: Palette = {
  bg: '#121311', card: '#1B1D1A', ink: '#F1EFE9', muted: '#9A9C95', line: '#2B2D29',
  accent: '#8DB8A3', accentSoft: '#223029', onAccent: '#10150F', warn: '#E09A6B', danger: '#E5736B', track: '#2A2C28',
};

export const font = { body: 'Inter_400Regular', medium: 'Inter_500Medium', semi: 'Inter_600SemiBold', display: 'Fraunces_600SemiBold' };
export const radius = { card: 22, input: 14, pill: 999 };
export const space = (n: number) => n * 4;

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
