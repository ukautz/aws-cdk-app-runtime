import * as cdk from '@aws-cdk/core';
import { keys as compiledKeysOf } from 'ts-transformer-keys';
import { SpecUtil } from '../util/spec';
import { ComponentSpecs } from './component-specs';

export interface ServiceSpecs extends ComponentSpecs {
  /**
   * The name of the Service (must be unique within Cluster)
   */
  service: string;

  /**
   * The public hostname the Service is exposed to. Can be empty, if service
   * does not offer network interface
   */
  publicHostname: string;

  /**
   * The private hostname the Service is exposed to. Can be empty, if Service
   * does not offer network interface
   */
  privateHostname: string;
}
export const serviceSpecKeys = compiledKeysOf<ServiceSpecs>().sort();

export class ServiceSpecs implements ServiceSpecs {
  static make = (generator?: (prop: string) => string): ServiceSpecs =>
    SpecUtil.make<ServiceSpecs>(serviceSpecKeys, generator);
  static fromContext = (scope: cdk.Construct, prefix?: string): ServiceSpecs =>
    SpecUtil.fromContext(serviceSpecKeys, scope, prefix);
  static fromSsm = (scope: cdk.Construct, prefix?: string): ServiceSpecs =>
    SpecUtil.fromSsm<ServiceSpecs>(serviceSpecKeys, scope, prefix);
  static toSsm = (scope: cdk.Construct, prefix: string, specs: ServiceSpecs, secure?: boolean): void =>
    SpecUtil.toSsm<ServiceSpecs>(scope, prefix, specs, secure);
}
