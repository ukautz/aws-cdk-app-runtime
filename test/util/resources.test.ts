import '@aws-cdk/assert/jest';
import { Resources, ResourcesProps } from '../../lib/util/resources';

describe('Resources', () => {
  describe('Normalizes properties', () => {
    [
      {
        name: 'uses defaults',
        props: <ResourcesProps>{},
        resources: new Resources({
          cpu: 256,
          memory: 512,
          scaling: {
            mode: 'fixed',
            amount: 1,
          },
        }),
      },
      {
        name: 'simple fixed declaration',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'fixed',
            amount: 1,
          },
        }),
      },
      {
        name: 'full fixed declaration',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'fixed',
            amount: 7,
          },
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'fixed',
            amount: 7,
          },
        }),
      },
      {
        name: 'full concurrent declaration',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'concurrent',
            concurrent: 11,
          },
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'concurrent',
            concurrent: 11,
          },
        }),
      },
      {
        name: 'scaling declaration',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'scaling',
            minCapacity: 123,
            maxCapacity: 234,
            thresholds: [{ resource: 'cpu', target: 33 }],
          },
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'scaling',
            minCapacity: 123,
            maxCapacity: 234,
            thresholds: [{ resource: 'cpu', target: 33 }],
          },
        }),
      },
      {
        name: 'scaling with missing thresholds',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'scaling',
            minCapacity: 123,
            maxCapacity: 234,
          },
        },
        error: new Error('missing thresholds'),
      },
      {
        name: 'scaling with duplicate, conflicting thresholds',
        props: <ResourcesProps>{
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'scaling',
            minCapacity: 123,
            maxCapacity: 234,
            thresholds: [
              { resource: 'cpu', target: 33 },
              { resource: 'cpu', target: 44 },
            ],
          },
        },
        error: new Error('duplicate thresholds for: cpu'),
      },
    ].forEach((t) => {
      test(t.name, () => {
        if (t.error) {
          expect(() => {
            new Resources(t.props);
          }).toThrow(t.error);
        } else {
          const resources = new Resources(t.props);
          expect(resources.cpu).toEqual(t.resources.cpu);
          expect(resources.memory).toEqual(t.resources.memory);
          expect(resources.scaling).toEqual(t.resources.scaling);
        }
      });
    });
  });
  describe('Can be encoded and decoded', () => {
    [
      {
        rendered: 'cpu: 123, memory: 234, fixed: 1',
        json: <Record<string, string>>{
          cpu: '123',
          memory: '234',
          fixed: '1',
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'fixed',
            amount: 1,
          },
        }),
      },
      {
        rendered: 'cpu: 123, memory: 234, concurrent: 3',
        json: <Record<string, string>>{
          cpu: '123',
          memory: '234',
          concurrent: '3',
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'concurrent',
            concurrent: 3,
          },
        }),
      },
      {
        rendered: 'cpu: 123, memory: 234, min: 11, max: 22, target_cpu: 33, target_memory: 44',
        json: <Record<string, string>>{
          cpu: '123',
          memory: '234',
          min: '11',
          max: '22',
          target_cpu: '33',
          target_memory: '44',
        },
        resources: new Resources({
          cpu: 123,
          memory: 234,
          scaling: {
            mode: 'scaling',
            minCapacity: 11,
            maxCapacity: 22,
            thresholds: [
              {
                resource: 'cpu',
                target: 33,
              },
              {
                resource: 'memory',
                target: 44,
              },
            ],
          },
        }),
      },
    ].forEach((t) => {
      test(`toString ${t.rendered}`, () => {
        expect(t.resources.toString()).toEqual(t.rendered);
      });
      test(`fromString ${t.rendered}`, () => {
        expect(t.resources.toString()).toEqual(t.rendered);
      });
      test(`toJson ${t.rendered}`, () => {
        expect(t.resources.toJson()).toEqual(t.json);
      });
      test(`fromJson ${t.rendered}`, () => {
        expect(Resources.fromJson(t.json)).toEqual(t.resources);
      });
    });
  });
});
