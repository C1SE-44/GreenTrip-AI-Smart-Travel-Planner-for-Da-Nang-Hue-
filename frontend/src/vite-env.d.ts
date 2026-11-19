/// <reference types="vite/client" />

declare module 'morphicons/react';

export {};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type: 'standard';
              theme: 'outline';
              size: 'large';
              text: 'continue_with' | 'signin_with' | 'signup_with';
              shape: 'pill' | 'rectangular';
              logo_alignment: 'left';
              width: number;
            },
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}
