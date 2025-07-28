export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  try {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      type: 'module',
      scope: '/'
    });

    if (registration.installing) {
      console.log('Service worker installing');
    } else if (registration.waiting) {
      console.log('Service worker installed');
    } else if (registration.active) {
      console.log('Service worker active');
    }

    // Ensure the service worker is controlling the page
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          resolve();
        });
      });
    }

    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    throw error;
  }
};
