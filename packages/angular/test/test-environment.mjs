import '@angular/compiler';
import {
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ServerTestingModule,
  platformServerTesting,
} from '@angular/platform-server/testing';

const mode = process.env.TANDROVE_TEST_CHANGE_DETECTION ?? 'zoneless';
if (mode !== 'zone' && mode !== 'zoneless')
  throw new Error(`Unknown change detection mode: ${mode}`);
if (mode === 'zone') await import('zone.js/node');
TestBed.initTestEnvironment(ServerTestingModule, platformServerTesting());

export function configureChangeDetection() {
  TestBed.configureTestingModule({
    providers: [
      mode === 'zone'
        ? provideZoneChangeDetection()
        : provideZonelessChangeDetection(),
    ],
  });
}
