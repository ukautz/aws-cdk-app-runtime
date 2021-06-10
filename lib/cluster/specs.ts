import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import { keys as compiledKeysOf } from 'ts-transformer-keys';
import { SpecUtil } from '../util/spec';
import { RouterSpecs } from './router';

/**
 * Specs (State) that the runtime cluster exports, that will be required by other
 * runtime components within the runtime cluster, like runtime services.
 */
export interface Specs extends RouterSpecs {
  /**
   * Name of the CloudMap namespace, i.e. the cluster internal hostname
   */
  privateDomain: string;

  /**
   * The full public domain names, like 'apps.domain.tld', of which sub-domains like '<my-app>.apps.domain.tld>', will be routing traffic to service <my-app>
   */
  publicDomain: string;

  /**
   * ARN of the hosted zone that holds the apex and wildcard records pointing to the load balancer
   */
  zoneArn: string;

  /**
   * ID of the hosted zone that holds the apex and wildcard records pointing to the load balancer
   */
  zoneId: string;

  /**
   * Name of the hosted zone that holds the apex and wildcard records pointing to the load balancer
   */
  zoneName: string;

  /**
   * Comma separated list of availability zones this cluster is using
   */
  availabilityZones: string;

  /**
   * ARN of the ECS cluster
   */
  clusterArn: string;

  /**
   * Name of the ECS cluster
   */
  clusterName: string;

  /**
   * ARN of the cloudmap namespace for internal service name resolution
   */
  namespaceArn: string;

  /**
   * ID of the cloudmap namespace for internal service name resolution
   */
  namespaceId: string;

  /**
   * Name of the cloudmap namespace for internal service name resolution
   */
  namespaceName: string;

  /**
   * ID of the VPC the ECS cluster runs in
   */
  vpcId: string;
}

/**
 * Names of keys in the Runtime Cluster Specification
 */
export const specKeys = compiledKeysOf<Specs>().sort();

export class Specs implements Specs {
  static make = (generator?: (prop: string) => string): Specs => SpecUtil.make<Specs>(specKeys, generator);
  static fromContext = (scope: cdk.Construct, prefix?: string): Specs => SpecUtil.fromContext(specKeys, scope, prefix);
  static fromSsm = (scope: cdk.Construct, prefix?: string): Specs => SpecUtil.fromSsm<Specs>(specKeys, scope, prefix);
  static toSsm = (scope: cdk.Construct, prefix: string, specs: Specs, secure?: boolean): void =>
    SpecUtil.toSsm<Specs>(scope, prefix, specs, secure);

  /**
   * Loads VPC defined in cluster specs
   */
  static lookupVpc = (scope: cdk.Construct, id: string, specs: Specs): ec2.IVpc =>
    ec2.Vpc.fromLookup(scope, id, {
      vpcId: specs.vpcId,
    });

  /**
   * Loads ECS cluster defined in cluster specs
   */
  static lookupCluster = (scope: cdk.Construct, id: string, specs: Specs, vpc?: ec2.IVpc): ecs.ICluster =>
    ecs.Cluster.fromClusterAttributes(scope, id, {
      clusterName: specs.clusterName,
      securityGroups: [],
      vpc: vpc ?? Specs.lookupVpc(scope, `${id}Vpc`, specs),
    });

  /**
   * Loads cluster cloudmap / service discovery namespace (for private domain)
   */
  static lookupPrivateNamespace = (
    scope: cdk.Construct,
    id: string,
    specs: Specs
  ): servicediscovery.IPrivateDnsNamespace =>
    servicediscovery.PrivateDnsNamespace.fromPrivateDnsNamespaceAttributes(scope, id, specs);
}
