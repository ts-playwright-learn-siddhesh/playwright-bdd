import { Page } from '@playwright/test';
import { RegistrationPage } from './registration.page.js';
import { LoginPage } from './login.page.js';

export interface PageObjects {
  registration: RegistrationPage;
  login: LoginPage;
}

export function buildPageObjects(page: Page, baseUrl: string): PageObjects {
  return {
    registration: new RegistrationPage(page, baseUrl),
    login: new LoginPage(page, baseUrl),
  };
}
