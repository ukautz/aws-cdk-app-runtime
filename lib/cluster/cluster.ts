import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_route53 as route53,
  aws_servicediscovery as servicediscovery,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { loadHostedZone } from '../util/loaders';
import { Router, RouterPropsExposed } from './router';
import { Specs } from './specs';

export interface ClusterProps {
  /**
   * Name of the CloudMap namespace, i.e. the cluster internal hostname
   */
  readonly privateDomain: string;

  /**
   * The full public domain names, like 'apps.domain.tld', of which sub-domains like '<my-app>.apps.domain.tld>', will be routing traffic to service <my-app>
   */
  readonly publicDomain: string;

  /**
   * opt: existing hosted zones for used domains (hosted zone will be created if not given)
   */
  readonly hostedZone?: string | route53.IHostedZone;

  /**
   * Determines whether and how certificate is used:
   * * `false`: no certificate, route only port 80
   * * `true`:  create a certificate, assuming parentHostedZone is provided, route 80 to 443
   * * string: ARN to certificate, route 80 to 443
   * * a certificate
   */
  readonly certificate?: boolean | string | acm.ICertificate;

  /**
   * Optional ID of existing VPC. If not provided new VPC will be created
   */
  readonly vpc?: string | ec2.IVpc;

  /**
   * Optional max amount of AZ to span the cluster one. Assumes vpcId attribute is not defined
   */
  readonly maxAzs?: number;

  /**
   * Optional NAT instance size. If not provided then nat gateway is being used. Assumes vpcId attribute is not defined
   */
  readonly natInstanceType?: string;

  /**
   * Router specification, or default
   */
  readonly routerProps?: RouterPropsExposed;
}

/**
 * Cluster provides the Runtime part of Application Runtime.
 *
 * Components:
 * - Public domain, under which services will be exposed
 * - Private domain, under which inter-service traffic should flow
 * - A VPC, that can be provided or managed
 * - A managed ECS cluster (including a CloudMap of the private domain)
 * - A hosted zone for the public domain
 *
 * Considerations:
 * - Like to see in EKS. Option or Class? What is shared?
 */
export class Cluster extends Construct {
  public readonly privateDomain: string;
  public readonly publicDomain: string;
  public readonly hostedZone: route53.IHostedZone;
  public readonly vpc: ec2.IVpc;
  public readonly cluster: ecs.ICluster;
  public readonly router: Router;

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id);

    this.privateDomain = props.privateDomain;
    this.publicDomain = props.publicDomain;

    this.hostedZone = loadHostedZone(this, props.hostedZone, () =>
      route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: this.publicDomain,
      })
    );

    if (props.vpc && (props.natInstanceType || props.maxAzs)) {
      throw new Error('natInstanceType and maxAzs not allowed when vpcId is provided');
    }

    this.vpc = this.initVpc(props);
    this.cluster = this.initCluster(props);
    this.router = new Router(this, 'Router', {
      ...props.routerProps,
      publicDomain: props.publicDomain,
      certificate: props.certificate,
      cluster: this.cluster,
      hostedZone: this.hostedZone,
    });
  }

  public get specs(): Specs {
    return {
      ...this.router.specs,
      availabilityZones: this.vpc.availabilityZones.join(','),
      clusterArn: this.cluster.clusterArn,
      clusterName: this.cluster.clusterName,
      namespaceArn: this.cluster.defaultCloudMapNamespace!.namespaceArn,
      namespaceId: this.cluster.defaultCloudMapNamespace!.namespaceId,
      namespaceName: this.cluster.defaultCloudMapNamespace!.namespaceName,
      privateDomain: this.privateDomain,
      publicDomain: this.publicDomain,
      vpcId: this.vpc.vpcId,
      zoneArn: this.hostedZone.hostedZoneArn,
      zoneId: this.hostedZone.hostedZoneId,
      zoneName: this.hostedZone.zoneName,
    } as Specs;
  }

  /**
   * Create or load the VPC
   * @param props
   */
  private initVpc(props: ClusterProps): ec2.IVpc {
    if (typeof props.vpc === 'string') {
      return ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpc });
    } else if (props.vpc) {
      return props.vpc;
    }
    return new ec2.Vpc(this, 'Vpc', {
      maxAzs: props.maxAzs,
      subnetConfiguration: ec2.Vpc.DEFAULT_SUBNETS,
      ...(props.natInstanceType
        ? {
            natGatewayProvider: new ec2.NatInstanceProvider({
              instanceType: new ec2.InstanceType(props.natInstanceType),
            }),
          }
        : {}),
    });
  }

  /**
   * Create the ECS Cluster all tasks will run in
   * @param props
   */
  private initCluster(props: ClusterProps): ecs.ICluster {
    return new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
      defaultCloudMapNamespace: {
        name: props.privateDomain,
        type: servicediscovery.NamespaceType.DNS_PRIVATE,
      },
    });
  }
}
