import '@aws-cdk/assert/jest';
import { ServiceSpecs, serviceSpecKeys } from '../../lib/service';
import { assertSpecs } from '../util/specs.suite';

describe('Service Specs', () => {
  test('Can list keys', () => {
    expect(serviceSpecKeys).toEqual(
      [
        'cluster',
        'iamPrincipal',
        'privateHostname',
        'publicHostname',
        'resources',
        'securityGroupIds',
        'service',
      ].sort()
    );
  });
  assertSpecs<ServiceSpecs>({
    name: 'Service',
    keys: serviceSpecKeys,
    make: ServiceSpecs.make,
    fromContext: ServiceSpecs.fromContext,
    fromSsm: ServiceSpecs.fromSsm,
    toSsm: ServiceSpecs.toSsm,
  });
});
