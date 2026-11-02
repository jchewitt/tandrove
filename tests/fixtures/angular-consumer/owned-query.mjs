import { configureChangeDetection } from './test-environment.mjs';
import assert from 'node:assert/strict';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AcquisitionClient, resourceAddress } from '@tandrove/core';
import { injectStateQuery, provideTandroveClient } from '@tandrove/angular';

configureChangeDetection();
const token = new InjectionToken('packed client');
const root = createEnvironmentInjector(
  [provideTandroveClient(token, () => new AcquisitionClient())],
  TestBed.inject(EnvironmentInjector),
);
const owner = createEnvironmentInjector([], root);
const id = signal('A');
const authority = {}; // Equivalent wrappers share this backend; addresses isolate sessions.
const source = (value) => ({
  authority,
  stateAddress: resourceAddress({ source: 'packed', scope: value }, [
    { name: 'item', arguments: {} },
  ]),
  selection: [
    { name: 'name', responseName: 'name', arguments: {}, children: [] },
  ],
  read: async () => [
    {
      identity: { id: '1' },
      fields: [
        { kind: 'write', path: [{ name: 'name', arguments: {} }], value },
      ],
    },
  ],
});
try {
  const query = injectStateQuery(
    id,
    (value) => inject(token).watch(source(value)),
    { injector: owner },
  );
  await query.ensure();
  assert.equal(query.state().snapshot.records[0].data.name, 'A');
  id.set('B');
  assert.equal(query.state().status, 'pending');
  await assert.rejects(query.refresh(), /current binding/);
  TestBed.tick();
  await query.ensure();
  assert.equal(query.state().snapshot.records[0].data.name, 'B');
  owner.destroy();
  assert.equal(query.state().status, 'disposed');
  const peer = root.get(token).watch(source('B'));
  await peer.ready;
  assert.equal(peer.getSnapshot().records[0].data.name, 'B');
  peer.dispose();
} finally {
  if (!owner.destroyed) owner.destroy();
  root.destroy();
  TestBed.resetTestingModule();
}
