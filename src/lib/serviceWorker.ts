export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers not supported')
  }

  const registration = await navigator.serviceWorker.register('/sw.js', {
    type: 'module',
    scope: '/'
  })

  await new Promise<void>((resolve) => {
    if (registration.active) {
      resolve()
    } else {
      registration.addEventListener('updatefound', () => {
        if (registration.installing) {
          registration.installing.addEventListener('statechange', () => {
            if (registration.active) resolve()
          })
        }
      })
    }
  })

  return registration
}
