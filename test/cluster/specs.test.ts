import '@aws-cdk/assert/jest';
import { Specs as ClusterSpecs, specKeys as clusterSpecKeys } from '../../lib/cluster/specs';
import { assertSpecs } from '../util/specs.suite';

describe('Specs', () => {
  test('Can list keys', () => {
    expect(clusterSpecKeys).toEqual(
      [
        'availabilityZones',
        'clusterArn',
        'clusterName',
        'namespaceArn',
        'namespaceId',
        'namespaceName',
        'privateDomain',
        'publicDomain',
        'routerArn',
        'routerCertificateArn',
        'routerLoadBalancerArn',
        'routerLoadBalancerDnsName',
        'routerLoadBalancerSecurityGroupId',
        'routerRoleArn',
        'routerSecurityGroupIds',
        'routerTaskDefinitionArn',
        'vpcId',
        'zoneArn',
        'zoneId',
        'zoneName',
      ].sort()
    );
  });
  assertSpecs<ClusterSpecs>({
    name: 'Cluster',
    keys: clusterSpecKeys,
    make: ClusterSpecs.make,
    fromContext: ClusterSpecs.fromContext,
    fromSsm: ClusterSpecs.fromSsm,
    toSsm: ClusterSpecs.toSsm,
  });
});
