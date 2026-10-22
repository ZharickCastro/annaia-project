import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

// Fechas y números en español de Colombia para todos los pipes (date, number...).
registerLocaleData(localeEsCO);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
