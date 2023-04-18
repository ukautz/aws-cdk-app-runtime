import { Construct } from 'constructs';
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
export const serviceSpecKeys = compiledKeysOf<ServiceSpecs>().sort() as Array<string>;

export class ServiceSpecs implements ServiceSpecs {
  static make = (generator?: (prop: string) => string): ServiceSpecs =>
    SpecUtil.make<ServiceSpecs>(serviceSpecKeys, generator);
  static fromContext = (scope: Construct, prefix?: string): ServiceSpecs =>
    SpecUtil.fromContext(serviceSpecKeys, scope, prefix);
  static fromSsm = (scope: Construct, prefix?: string): ServiceSpecs =>
    SpecUtil.fromSsm<ServiceSpecs>(serviceSpecKeys, scope, prefix);
  static toSsm = (scope: Construct, prefix: string, specs: ServiceSpecs): void =>
    SpecUtil.toSsm<ServiceSpecs>(serviceSpecKeys, scope, prefix, specs);
}
