import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, confirmLabel: string, cancelLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }));
}
export function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message); else Alert.alert(message);
}
