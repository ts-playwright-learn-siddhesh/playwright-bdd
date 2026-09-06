import { Page } from '@playwright/test';
import { RegistrationPage } from './registration.page.js';

export interface PageObjects {
  registration: RegistrationPage;
}

export function buildPageObjects(page: Page, baseUrl: string): PageObjects {
  return {
    registration: new RegistrationPage(page, baseUrl),
  };
}
