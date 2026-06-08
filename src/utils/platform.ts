export type Platform = 'ios' | 'android' | 'desktop';

export interface InstructionStep {
  step: number;
  text: string;
  badge?: string;
}

export interface PlatformInstructions {
  platformName: string;
  title: string;
  steps: InstructionStep[];
}

export function getPlatform(): Platform {
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

  // Detect iOS
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && 'ontouchend' in document)) {
    return 'ios';
  }

  // Detect Android
  if (/android/i.test(userAgent)) {
    return 'android';
  }

  // Fallback to Desktop
  return 'desktop';
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function getInstallInstructions(platform: Platform): PlatformInstructions {
  switch (platform) {
    case 'ios':
      return {
        platformName: 'iOS (iPhone/iPad)',
        title: 'Install HabitNook on iOS',
        steps: [
          {
            step: 1,
            text: "Tap the Share button in Safari's toolbar",
            badge: "📤 Share"
          },
          {
            step: 2,
            text: "Scroll down the sharing menu and select",
            badge: "➕ Add to Home Screen"
          }
        ]
      };
    case 'android':
      return {
        platformName: 'Android (Chrome/Firefox)',
        title: 'Install HabitNook on Android',
        steps: [
          {
            step: 1,
            text: "Tap the menu icon (three dots) in the top-right corner of your browser",
            badge: "⋮ Menu"
          },
          {
            step: 2,
            text: "Select either 'Install app' or 'Add to Home screen' from the dropdown list",
            badge: "📥 Install app"
          }
        ]
      };
    case 'desktop':
    default:
      return {
        platformName: 'Desktop (Chrome/Edge/Safari)',
        title: 'Install HabitNook on Desktop',
        steps: [
          {
            step: 1,
            text: "Click the Install App icon located on the right side of the address bar",
            badge: "🖥️ Install Icon"
          },
          {
            step: 2,
            text: "Confirm the prompt by clicking",
            badge: "Install"
          }
        ]
      };
  }
}
